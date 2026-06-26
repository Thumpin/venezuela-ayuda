"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthClient } from "@/lib/supabase/auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminEmail, isEmailAdmin } from "@/lib/admin";

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
  const { error } = await svc
    .from("damaged_reports")
    .update({
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? email : null,
    })
    .eq("id", id);
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
  const { error } = await svc.from(table).update({ hidden }).eq("id", id);
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
  const { error } = await svc.from(table).delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo eliminar." };
  revalidatePath("/mapa");
  revalidatePath("/buscar");
  revalidatePath("/admin");
  return { ok: true };
}

// --- Dedup review (merge_candidates) -----------------------------------------
// Human decision on a duplicate pair. "duplicate" hides the dup checkin (NEVER
// deletes — a wrong call is recoverable by un-hiding) and marks the candidate
// MERGED; "not" marks it REJECTED so it won't resurface. Both record who/when.
export async function decideMerge(
  candidateId: string,
  decision: "duplicate" | "not",
): Promise<Result> {
  let email: string;
  try {
    email = await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (!UUID_RE.test(candidateId)) return { ok: false, error: "Id inválido." };

  const svc = getServerSupabase();
  // Load the candidate (we need dup_id when confirming a merge).
  const { data: cand, error: loadErr } = await svc
    .from("merge_candidates")
    .select("id,dup_id,status")
    .eq("id", candidateId)
    .maybeSingle();
  if (loadErr || !cand) return { ok: false, error: "No se encontró el candidato." };
  if (cand.status !== "PENDING") return { ok: false, error: "Ya fue revisado." };

  if (decision === "duplicate") {
    // Retire the duplicate by hiding it (reversible), keeping the richer row.
    const { error: hideErr } = await svc
      .from("checkins")
      .update({ hidden: true })
      .eq("id", cand.dup_id);
    if (hideErr) return { ok: false, error: "No se pudo ocultar el duplicado." };
  }

  const { error: updErr } = await svc
    .from("merge_candidates")
    .update({
      status: decision === "duplicate" ? "MERGED" : "REJECTED",
      decided_by: email,
      decided_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (updErr) return { ok: false, error: "No se pudo guardar la decisión." };

  revalidatePath("/admin/duplicados");
  revalidatePath("/mapa");
  revalidatePath("/buscar");
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
