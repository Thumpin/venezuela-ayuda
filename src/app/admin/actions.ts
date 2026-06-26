"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthClient } from "@/lib/supabase/auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { createNotification, getAdminEmail, isEmailAdmin, markNotificationRead, releaseMyAssignments, reopenMergeCandidate } from "@/lib/admin";

export type AuthState = { error?: string };
type Result = { ok: boolean; error?: string };

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
  try { me = await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
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
  try { me = await requireAdmin(); } catch { return { ok: false, error: "No autorizado." }; }
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
