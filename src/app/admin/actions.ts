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
// Human decision on a whole BLOCK of possible duplicates at once.
//
// The dedup engine queues PAIRS, but transitively-linked pairs form a block
// (e.g. A↔B, B↔C → one block {A,B,C}). The admin picks ONE record to keep and
// checks which OTHER members are truly the same person — some members may be a
// bad chain and aren't checked. We then, scoped to this block's candidate rows:
//   • hide each confirmed-duplicate checkin (NEVER delete — un-hiding recovers a
//     wrong call) and mark every pair touching it MERGED;
//   • mark the remaining pairs REJECTED so they don't resurface.
// Every decision records who/when.
//
// `keepId` must be a block member; `dupIds` the members to retire.
export async function decideCluster(
  candidateIds: string[],
  keepId: string,
  dupIds: string[],
): Promise<Result> {
  let email: string;
  try {
    email = await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length === 0 ||
    !candidateIds.every((id) => UUID_RE.test(id)) ||
    !UUID_RE.test(keepId) ||
    !Array.isArray(dupIds) ||
    !dupIds.every((id) => UUID_RE.test(id)) ||
    dupIds.includes(keepId)
  ) {
    return { ok: false, error: "Solicitud inválida." };
  }

  const svc = getServerSupabase();
  // Load exactly this block's pending pairs (re-checked server-side: the client
  // can't expand the set or act on already-decided rows).
  const { data: cands, error: loadErr } = await svc
    .from("merge_candidates")
    .select("id,keep_id,dup_id,status")
    .in("id", candidateIds)
    .eq("status", "PENDING");
  if (loadErr) return { ok: false, error: "No se pudo cargar el bloque." };
  if (!cands?.length) return { ok: false, error: "El bloque ya fue revisado." };

  // Every member id referenced by these pairs — guards against the client naming
  // a keep/dup that isn't actually in the block.
  const members = new Set(cands.flatMap((c) => [c.keep_id, c.dup_id]));
  if (!members.has(keepId) || dupIds.some((id) => !members.has(id))) {
    return { ok: false, error: "Selección fuera del bloque." };
  }

  const dupSet = new Set(dupIds);
  const now = new Date().toISOString();

  // Hide the confirmed duplicates (reversible). The kept record stays visible.
  if (dupSet.size > 0) {
    const { error: hideErr } = await svc
      .from("checkins")
      .update({ hidden: true })
      .in("id", [...dupSet]);
    if (hideErr) return { ok: false, error: "No se pudieron ocultar los duplicados." };
  }

  // A pair is MERGED if it touches a confirmed duplicate; otherwise REJECTED.
  const mergedIds: string[] = [];
  const rejectedIds: string[] = [];
  for (const c of cands) {
    if (dupSet.has(c.keep_id) || dupSet.has(c.dup_id)) mergedIds.push(c.id);
    else rejectedIds.push(c.id);
  }

  for (const [ids, status] of [
    [mergedIds, "MERGED"],
    [rejectedIds, "REJECTED"],
  ] as const) {
    if (ids.length === 0) continue;
    const { error: updErr } = await svc
      .from("merge_candidates")
      .update({ status, decided_by: email, decided_at: now })
      .in("id", ids);
    if (updErr) return { ok: false, error: "No se pudo guardar la decisión." };
  }

  revalidatePath("/admin/duplicados");
  revalidatePath("/mapa");
  revalidatePath("/buscar");
  return { ok: true };
}

// "No estoy seguro": set a block aside for a second look instead of deciding now.
// Flips its pairs PENDING ↔ DEFERRED (no checkin is hidden either way). The
// deferred lane (?estado=dudosos) can send a block back with `toPending`.
async function moveCluster(
  candidateIds: string[],
  from: "PENDING" | "DEFERRED",
  to: "PENDING" | "DEFERRED",
): Promise<Result> {
  let email: string;
  try {
    email = await requireAdmin();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length === 0 ||
    !candidateIds.every((id) => UUID_RE.test(id))
  ) {
    return { ok: false, error: "Solicitud inválida." };
  }

  const svc = getServerSupabase();
  // Only move rows that are actually in the source lane (re-checked server-side).
  const { data: updated, error } = await svc
    .from("merge_candidates")
    .update({
      status: to,
      // Stamp who/when set it aside; clear it when sending back to the queue.
      decided_by: to === "DEFERRED" ? email : null,
      decided_at: to === "DEFERRED" ? new Date().toISOString() : null,
    })
    .in("id", candidateIds)
    .eq("status", from)
    .select("id");
  if (error) return { ok: false, error: "No se pudo guardar." };
  if (!updated?.length) return { ok: false, error: "El bloque ya fue revisado." };

  revalidatePath("/admin/duplicados");
  return { ok: true };
}

// Set a pending block aside ("no estoy seguro").
export async function deferCluster(candidateIds: string[]): Promise<Result> {
  return moveCluster(candidateIds, "PENDING", "DEFERRED");
}

// Send a deferred block back to the main queue for a real decision.
export async function requeueCluster(candidateIds: string[]): Promise<Result> {
  return moveCluster(candidateIds, "DEFERRED", "PENDING");
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
