"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthClient } from "@/lib/supabase/auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminEmail, isEmailAdmin } from "@/lib/admin";
import { generateApiKey, hashKey, parsePrefix } from "@/lib/apiAuth.mjs";
import { patchArgs, deleteArgs } from "@/lib/internalWrite.mjs";

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

// First-time: an allowlisted email sets its own password (created server-side
// with email pre-confirmed, so there's no email round-trip).
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

export async function verifyDamagedReport(id: string, verified: boolean): Promise<Result> {
  let email: string;
  try {
    email = await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc.rpc(
    "patch_report",
    patchArgs("damaged_reports", id, {
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? email : null,
    })
  );
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  revalidatePath(`/edificio/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function setHidden(table: string, id: string, hidden: boolean): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!MODERATABLE.has(table) || !UUID_RE.test(id))
    return { ok: false, error: "Solicitud inválida." };
  const svc = getServerSupabase();
  const { error } = await svc.rpc("patch_report", patchArgs(table, id, { hidden }));
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  revalidatePath("/buscar");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteReport(table: string, id: string): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!MODERATABLE.has(table) || !UUID_RE.test(id))
    return { ok: false, error: "Solicitud inválida." };
  const svc = getServerSupabase();
  const { error } = await svc.rpc("delete_report", deleteArgs(table, id));
  if (error) return { ok: false, error: "No se pudo eliminar." };
  revalidatePath("/mapa");
  revalidatePath("/buscar");
  revalidatePath("/admin");
  return { ok: true };
}

// --- Collection centers (centros de acopio) ---------------------------------
export async function verifyCenter(id: string, verified: boolean): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc.rpc("patch_report", patchArgs("collection_centers", id, { verified }));
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  revalidatePath("/ayudar-fuera");
  revalidatePath("/admin");
  return { ok: true };
}

export async function setCenterHidden(id: string, hidden: boolean): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc.rpc("patch_report", patchArgs("collection_centers", id, { hidden }));
  if (error) return { ok: false, error: "No se pudo actualizar." };
  revalidatePath("/mapa");
  revalidatePath("/ayudar-fuera");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteCenter(id: string): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };
  const svc = getServerSupabase();
  const { error } = await svc.rpc("delete_report", deleteArgs("collection_centers", id));
  if (error) return { ok: false, error: "No se pudo eliminar." };
  revalidatePath("/mapa");
  revalidatePath("/ayudar-fuera");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateCenter(
  id: string,
  fields: Record<string, unknown>,
): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "Id inválido." };

  const LIMITS_BY_KEY: Record<string, number> = {
    name: 80, country: 80, state: 80, city: 80, address: 200,
    resources: 800, organizers: 80, contact: 120, website: 500,
  };
  const update: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(LIMITS_BY_KEY)) {
    if (!(k in fields)) continue;
    const v = String(fields[k] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    if ((k === "name" || k === "country") && !v)
      return { ok: false, error: "El nombre y el país no pueden quedar vacíos." };
    update[k] = v || null;
  }
  if ("can_ship_to_venezuela" in fields) {
    const v = fields.can_ship_to_venezuela;
    update.can_ship_to_venezuela = v === null || v === undefined ? null : Boolean(v);
  }
  if ("volunteers_count" in fields) {
    const n = Number(fields.volunteers_count);
    update.volunteers_count =
      Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 100000) : null;
  }
  if ("needs_volunteers" in fields) {
    const needsVol = Boolean(fields.needs_volunteers);
    update.needs_volunteers = needsVol;
    update.needs = ["centro-de-acopio", ...(needsVol ? ["voluntarios"] : [])];
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const svc = getServerSupabase();
  const { error } = await svc.rpc("patch_report", patchArgs("collection_centers", id, update));
  if (error) return { ok: false, error: "No se pudo guardar." };
  revalidatePath("/mapa");
  revalidatePath("/ayudar-fuera");
  revalidatePath("/admin");
  return { ok: true };
}

// --- Manage admins -----------------------------------------------------------
export async function addAdmin(email: string): Promise<Result> {
  let me: string;
  try {
    me = await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean))
    return { ok: false, error: "Correo inválido." };
  const svc = getServerSupabase();
  const { error } = await svc
    .from("admin_emails")
    .upsert({ email: clean, added_by: me }, { onConflict: "email" });
  if (error) return { ok: false, error: "No se pudo agregar." };
  revalidatePath("/admin/admins");
  return { ok: true };
}

export async function removeAdmin(email: string): Promise<Result> {
  let me: string;
  try {
    me = await requireAdmin();
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

// --- Manage collaborators (API partners) -------------------------------------
const SOURCE_RE = /^[a-z0-9][a-z0-9.\-]{1,80}$/; // dominio/identificador del socio

// Crea un colaborador y le emite su API key. La key se devuelve EN CLARO una
// sola vez (en la DB solo queda el hash + prefix). El `source` identifica al
// socio en cada reporte que ingrese con esta key.
export async function createPartner(input: {
  name: string;
  source: string;
  contact?: string;
}): Promise<PartnerResult> {
  try {
    await requireAdmin();
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
  return { ok: true, key, id: data.id }; // key visible una sola vez; id no es secreto
}

export async function revokePartner(id: string): Promise<Result> {
  try {
    await requireAdmin();
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
