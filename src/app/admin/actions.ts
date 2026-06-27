"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthClient } from "@/lib/supabase/auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminEmail, isEmailAdmin, isSuperAdmin, createNotification, markNotificationRead, releaseMyAssignments, reopenMergeCandidate } from "@/lib/admin";
import { generateApiKey, hashKey, parsePrefix } from "@/lib/apiAuth.mjs";
import { patchArgs, deleteArgs } from "@/lib/internalWrite.mjs";
import { buildRow, INGEST_TABLES } from "@/lib/ingest.mjs";
import { parseDump } from "@/lib/batchIngest.mjs";
import { VA_PARTNER_ID } from "@/lib/canonical.mjs";

export type AuthState = { error?: string };
type Result = { ok: boolean; error?: string };
type PartnerResult = Result & { key?: string; id?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODERATABLE = new Set(["checkins", "help_requests", "help_offers", "damaged_reports"]);

function emailOf(form: FormData) {
  return String(form.get("email") || "").trim().toLowerCase();
}

// --- Session -----------------------------------------------------------------
export async function adminSignIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (process.env.BYPASS_ADMIN_AUTH === "true") {
    redirect("/admin");
  }
  if (!isSupabaseConfigured()) return { error: "Servicio no disponible." };
  const email = emailOf(form);
  const password = String(form.get("password") || "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };

  const auth = await getAuthClient();
  const { error } = await auth.auth.signInWithPassword({ email, password });
  if (error) return { error: "Correo o contraseña incorrectos." };

  if (!(await isEmailAdmin(email))) {
    await auth.auth.signOut();
    return { error: "Esta cuenta no tiene acceso de administrador." };
  }
  redirect("/admin");
}

export async function adminSignUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Servicio no disponible." };
  const email = emailOf(form);
  const password = String(form.get("password") || "");
  if (!email || password.length < 8)
    return { error: "Usa una contraseña de al menos 8 caracteres." };
  if (!(await isEmailAdmin(email)))
    return { error: "Este correo no está autorizado como administrador." };

  const svc = getServerSupabase();
  const { error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr && !/already|registered|exists/i.test(createErr.message))
    return { error: "No se pudo crear la cuenta. Intenta de nuevo." };

  const auth = await getAuthClient();
  const { error: signErr } = await auth.auth.signInWithPassword({ email, password });
  if (signErr)
    return {
      error: createErr
        ? "Ese correo ya tiene una cuenta. Usa Iniciar sesión."
        : "No se pudo iniciar sesión. Intenta de nuevo.",
    };
  redirect("/admin");
}

export async function adminSignOut() {
  const auth = await getAuthClient();
  await auth.auth.signOut();
  redirect("/admin");
}

// --- Guarded admin mutations -------------------------------------------------
async function requireAdmin(): Promise<string> {
  const email = await getAdminEmail();
  if (!email) throw new Error("No autorizado");
  return email;
}

// Stricter gate for privileged actions: managing admins, issuing API keys, and
// batch ingest. Throws unless the caller is a super-admin.
async function requireSuperAdmin(): Promise<string> {
  const email = await getAdminEmail();
  if (!email || !(await isSuperAdmin(email))) throw new Error("No autorizado");
  return email;
}

export async function verifyDamagedReport(id: string, verified: boolean): Promise<Result> {
  let email: string;
  try { email = await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc
    .from("damaged_reports")
    .update({ verified_at: verified ? new Date().toISOString() : null, verified_by: verified ? email : null })
    .eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa"); revalidatePath(`/edificio/${id}`); revalidatePath("/admin");
  return { ok: true };
}

// Correct partially-wrong info on a community damaged-building report (text,
// city, severity) before/after verifying it. Patches via the audited RPC.
const DAMAGE_SEVERITIES = new Set(["CRACKS", "PARTIAL", "COLLAPSE_RISK", "COLLAPSED"]);

export async function updateDamagedReport(
  id: string,
  fields: Record<string, unknown>,
): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };

  const update: Record<string, unknown> = {};
  const TEXT: Record<string, number> = { place_name: 120, description: 800, city: 80 };
  for (const [k, max] of Object.entries(TEXT)) {
    if (!(k in fields)) continue;
    const v = String(fields[k] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    if (k === "place_name" && !v)
      return { ok: false, error: "El nombre del lugar no puede quedar vacío." };
    update[k] = v || null;
  }
  if ("severity" in fields) {
    const s = String(fields.severity ?? "");
    if (!DAMAGE_SEVERITIES.has(s)) return { ok: false, error: "Severidad inválida." };
    update.severity = s;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const svc = getServerSupabase();
  const { error } = await svc.rpc("patch_report", patchArgs("damaged_reports", id, update));
  if (error) return { ok: false, error: "No se pudo guardar." };
  revalidatePath("/mapa");
  revalidatePath(`/edificio/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function setHidden(table: string, id: string, hidden: boolean): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!MODERATABLE.has(table) || !UUID_RE.test(id)) return { ok: false, error: "Solicitud inválida." };
  const svc = getServerSupabase();
  const { error } = await svc.from(table).update({ hidden }).eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa"); revalidatePath("/buscar"); revalidatePath("/admin");
  return { ok: true };
}

export async function deleteReport(table: string, id: string): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!MODERATABLE.has(table) || !UUID_RE.test(id)) return { ok: false, error: "Solicitud inválida." };
  const svc = getServerSupabase();
  const { error } = await svc.from(table).delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo eliminar." };
  revalidatePath("/mapa"); revalidatePath("/buscar"); revalidatePath("/admin");
  return { ok: true };
}

// --- Dedup review -----------------------------------------------------------

export async function decideMerge(
  candidateId: string,
  decision: "duplicate" | "consolidate" | "skip",
): Promise<Result> {
  let email: string;
  try { email = await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(candidateId) && !candidateId.startsWith("mock-"))
    return { ok: false, error: "Id inválido." };

  if (!isSupabaseConfigured() && process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const svc = getServerSupabase();
  const { data: cand, error: loadErr } = await svc
    .from("merge_candidates")
    .select("id,keep_id,dup_id,status")
    .eq("id", candidateId)
    .maybeSingle();
  if (loadErr || !cand) return { ok: false, error: "No se encontró el candidato." };
  if (cand.status !== "PENDING") return { ok: false, error: "Ya fue revisado." };

  const hideTarget = decision === "duplicate" ? cand.dup_id
    : decision === "consolidate" ? cand.keep_id
    : null;

  if (hideTarget) {
    const { error: hideErr } = await svc
      .from("checkins")
      .update({ hidden: true })
      .eq("id", hideTarget);
    if (hideErr) return { ok: false, error: "No se pudo ocultar el registro." };

    await createNotification(
      hideTarget,
      decision === "duplicate" ? "merged" : "consolidated",
      "El reporte que hiciste fue revisado y se confirmó que la persona está a salvo.",
    );
  }

  const statusMap: Record<string, string> = { duplicate: "MERGED", consolidate: "MERGED", skip: "SKIPPED" };
  const { error: updErr } = await svc
    .from("merge_candidates")
    .update({
      status: statusMap[decision],
      decided_by: decision === "skip" ? null : email,
      decided_at: decision === "skip" ? null : new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (updErr) return { ok: false, error: "No se pudo guardar la decisión." };

  revalidatePath("/admin/duplicados"); revalidatePath("/mapa"); revalidatePath("/buscar");
  return { ok: true };
}

export async function reopenMerge(candidateId: string): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(candidateId) && !candidateId.startsWith("mock-"))
    return { ok: false, error: "Id inválido." };

  if (!isSupabaseConfigured() && process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  try {
    await reopenMergeCandidate(candidateId);
  } catch {
    return { ok: false, error: "No se pudo reabrir." };
  }

  revalidatePath("/admin/duplicados"); revalidatePath("/admin/duplicados/revisados");
  revalidatePath("/mapa"); revalidatePath("/buscar");
  return { ok: true };
}

export async function releaseAssignments(): Promise<Result> {
  try {
    const email = await requireAdmin();
    await releaseMyAssignments(email);
    revalidatePath("/admin/duplicados");
    return { ok: true };
  } catch { return { ok: false, error: "No autorizado." }; }
}

export async function dismissNotification(notificationId: string): Promise<Result> {
  if (!notificationId) return { ok: false, error: "Id inválido." };
  try { await markNotificationRead(notificationId); return { ok: true }; }
  catch { return { ok: false, error: "No se pudo descartar." }; }
}

// --- Manage admins -----------------------------------------------------------
export async function addAdmin(email: string): Promise<Result> {
  let me: string;
  try {
    me = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, error: "Correo inválido." };
  const svc = getServerSupabase();
  const { error } = await svc.from("admin_emails").upsert({ email: clean, added_by: me }, { onConflict: "email" });
  if (error) return { ok: false, error: "No se pudo agregar." };
  revalidatePath("/admin/admins");
  return { ok: true };
}

export async function removeAdmin(email: string): Promise<Result> {
  let me: string;
  try {
    me = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const clean = email.trim().toLowerCase();
  if (clean === me) return { ok: false, error: "No puedes quitarte a ti mismo." };
  const svc = getServerSupabase();
  const { error } = await svc.from("admin_emails").delete().eq("email", clean);
  if (error) return { ok: false, error: "No se pudo quitar." };
  revalidatePath("/admin/admins");
  return { ok: true };
}

// --- Collection centers --------------------------------------------------------
export async function verifyCenter(id: string, verified: boolean): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  if (!isSupabaseConfigured() && process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }
  const svc = getServerSupabase();
  const { error } = await svc.from("collection_centers").update({ verified }).eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  return { ok: true };
}

export async function setCenterHidden(id: string, hidden: boolean): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  if (!isSupabaseConfigured() && process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }
  const svc = getServerSupabase();
  const { error } = await svc.from("collection_centers").update({ hidden }).eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  return { ok: true };
}

export async function deleteCenter(id: string): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  if (!isSupabaseConfigured() && process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }
  const svc = getServerSupabase();
  const { error } = await svc.from("collection_centers").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo eliminar." };
  revalidatePath("/mapa");
  return { ok: true };
}

export async function updateCenter(id: string, fields: Record<string, unknown>): Promise<Result> {
  try { await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  if (!isSupabaseConfigured() && process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }
  const svc = getServerSupabase();
  const { error } = await svc.from("collection_centers").update(fields).eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  return { ok: true };
}

// Promote/demote another admin to super-admin. Super-admin only; can't demote
// yourself (avoids locking out the last super-admin by accident).
export async function setSuperAdmin(email: string, value: boolean): Promise<Result> {
  let me: string;
  try {
    me = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const clean = email.trim().toLowerCase();
  if (clean === me && !value)
    return { ok: false, error: "No puedes quitarte el rol de super-admin a ti mismo." };
  const svc = getServerSupabase();
  const { error } = await svc
    .from("admin_emails")
    .update({ is_super_admin: value })
    .eq("email", clean);
  if (error) return { ok: false, error: "No se pudo actualizar el rol." };
  revalidatePath("/admin/admins");
  return { ok: true };
}

// --- Manage collaborators (API partners) -------------------------------------
const SOURCE_RE = /^[a-z0-9][a-z0-9.\-]{1,80}$/; // dominio/identificador del socio

export async function createPartner(input: {
  name: string;
  source: string;
  contact?: string;
}): Promise<PartnerResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const name = String(input.name || "").trim();
  const source = String(input.source || "").trim().toLowerCase();
  const contact = String(input.contact || "").trim() || null;
  if (!name) return { ok: false, error: "Escribe el nombre del colaborador." };
  if (!SOURCE_RE.test(source))
    return { ok: false, error: "Source inválido (ej: cruzroja.org)." };

  const key = generateApiKey();
  const svc = getServerSupabase();
  const { data, error } = await svc
    .from("api_partners")
    .insert({
      name,
      source,
      key_hash: hashKey(key),
      key_prefix: parsePrefix(key),
      scopes: ["write"],
      contact,
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message))
      return { ok: false, error: "Ya existe un colaborador con ese source." };
    return { ok: false, error: "No se pudo crear el colaborador." };
  }
  revalidatePath("/admin/colaboradores");
  return { ok: true, key, id: data.id };
}

// --- Batch ingest (super-admin) ----------------------------------------------
// Ingest an external data dump (JSON / CSV / SQL INSERT statements). The dump is
// PARSED into canonical reports (never executed), validated by buildRow, and
// upserted through the SAME audited RPC as the public API. Rows are stamped with
// `source` (idempotent on (source, external_id)); audit is attributed to the hub.
const MAX_BATCH_ROWS = 2000;

type BatchResult = Result & {
  accepted?: number;
  rejected?: number;
  errored?: number;
  sample?: Array<{ external_id: string | null; status: string; error?: string }>;
};

export async function ingestBatch(input: {
  text: string;
  format?: "auto" | "json" | "csv" | "sql";
  source: string;
}): Promise<BatchResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const source = String(input.source || "").trim().toLowerCase();
  if (!SOURCE_RE.test(source))
    return { ok: false, error: "Source inválido (ej: cruzroja-dump)." };

  let reports: unknown[];
  try {
    reports = parseDump(String(input.text || ""), input.format ?? "auto");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el dump." };
  }
  if (!reports.length) return { ok: false, error: "El dump no contiene filas." };
  if (reports.length > MAX_BATCH_ROWS)
    return { ok: false, error: `Máximo ${MAX_BATCH_ROWS} filas por carga (recibidas ${reports.length}).` };

  // Validate + route + dedup intra-batch by external_id (same as /api/v1/reports).
  const results: Array<{ external_id: string | null; status: string; error?: string }> = [];
  const byTable: Record<string, Map<string, Record<string, unknown>>> = {};
  for (const rep of reports) {
    const built = buildRow(rep, source) as
      | { ok: true; table: string; row: Record<string, unknown> }
      | { ok: false; error: string };
    const extId = (rep as { external_id?: string })?.external_id ?? null;
    if (!built.ok) { results.push({ external_id: extId, status: "rejected", error: built.error }); continue; }
    (byTable[built.table] ??= new Map()).set(built.row.external_id as string, built.row);
  }

  const svc = getServerSupabase();
  const tables = (INGEST_TABLES as string[]).filter((t) => byTable[t]?.size);
  const outcomes = await Promise.allSettled(
    tables.map((t) =>
      svc.rpc("ingest_reports", {
        p_table: t,
        p_rows: [...byTable[t].values()],
        p_partner: VA_PARTNER_ID,
        p_source: source,
        p_request_id: null,
        p_ip: null,
        p_user_agent: null,
      }),
    ),
  );

  let accepted = 0;
  tables.forEach((t, i) => {
    const rows = [...byTable[t].values()];
    const o = outcomes[i];
    const failed = o.status === "rejected" || o.value.error;
    if (failed) {
      for (const row of rows)
        results.push({ external_id: (row.external_id as string) ?? null, status: "error", error: "Error de base de datos." });
    } else {
      accepted += rows.length;
      for (const row of rows)
        results.push({ external_id: (row.external_id as string) ?? null, status: "upserted" });
    }
  });

  const rejected = results.filter((r) => r.status === "rejected").length;
  const errored = results.filter((r) => r.status === "error").length;
  revalidatePath("/admin/ingesta");
  return {
    ok: accepted > 0 || (rejected === 0 && errored === 0),
    accepted, rejected, errored,
    sample: results.filter((r) => r.status !== "upserted").slice(0, 20),
  };
}

export async function revokePartner(id: string): Promise<Result> {
  try {
    await requireSuperAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc
    .from("api_partners")
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "No se pudo revocar." };
  revalidatePath("/admin/colaboradores");
  return { ok: true };
}

export async function updateHospitalizedPatient(
  id: string,
  patientData: {
    nombre: string;
    apellido: string;
    ci: string;
    edad: string;
    hospital: string;
    status: string;
    notas: string;
    fuentes: string;
  }
): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc
    .from("hospitalized")
    .update(patientData)
    .eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar el registro." };
  revalidatePath("/admin");
  revalidatePath("/buscar");
  return { ok: true };
}

export async function getReportDetails(
  table: string,
  id: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { data, error } = await svc
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se encontró el reporte." };
  return { ok: true, data };
}

export async function updateCheckinReport(
  id: string,
  data: {
    name: string;
    status: "SAFE" | "NEEDS_HELP" | "LOOKING_FOR_SOMEONE" | "DIFUNTO" | "HOSPITALIZADO";
    city: string;
    message: string;
    phone_private: string;
  }
): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc
    .from("checkins")
    .update(data)
    .eq("id", id);
  if (error) return { ok: false, error: "No se pudo actualizar el reporte." };
  revalidatePath("/admin");
  revalidatePath("/buscar");
  return { ok: true };
}

export async function autoMarkAsHospitalized(
  checkinId: string,
  hospitalName: string
): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(checkinId)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  
  // 1. Get the current report details to preserve other fields
  const { data: report, error: getErr } = await svc
    .from("checkins")
    .select("name, city, message, phone_private")
    .eq("id", checkinId)
    .single();
    
  if (getErr || !report) return { ok: false, error: "No se encontró el reporte." };
  
  // 2. Format a message indicating it was auto-matched to hospitalized
  const matchMsg = `[Sistema] Encontrado hospitalizado en: ${hospitalName}`;
  const newMessage = report.message 
    ? `${report.message}\n${matchMsg}`
    : matchMsg;

  // 3. Update the checkin status and note
  const { error: updateErr } = await svc
    .from("checkins")
    .update({
      status: "HOSPITALIZADO",
      message: newMessage
    })
    .eq("id", checkinId);
    
  if (updateErr) return { ok: false, error: "No se pudo actualizar el reporte." };
  
  revalidatePath("/admin");
  revalidatePath("/buscar");
  return { ok: true };
}

