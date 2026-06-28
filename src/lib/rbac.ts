import "server-only";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthClient } from "@/lib/supabase/auth";

// Atomic permission names. Keep in sync with the `permissions` table seed in
// migration 0029. Add new permissions there first, then extend this union.
export type Permission =
  | "admin.access"   // can log into /admin
  | "admin.super"    // can manage admins and API keys
  | "modupe.review"  // can review dedup candidates
  | "center.manage"  // can manage collection centers
  | "partner.manage" // can manage API partner keys

// Returns every permission the user holds across all their assigned roles.
// Uses the `user_permissions` SQL function (migration 0029) for a single
// round-trip instead of N joins in application code.
export async function getPermissions(email: string): Promise<Permission[]> {
  if (!isSupabaseConfigured()) return [];
  const svc = getServerSupabase();
  const { data, error } = await svc.rpc("user_permissions", { p_email: email.toLowerCase() });
  if (error || !data) return [];
  return (data as { permission_name: string }[]).map((r) => r.permission_name as Permission);
}

export async function hasPermission(email: string, permission: Permission): Promise<boolean> {
  const perms = await getPermissions(email);
  return perms.includes(permission);
}

// Returns the authenticated user's email if they hold the given permission.
// Throws "unauthenticated" or "forbidden" — callers should catch and redirect.
export async function requirePermission(permission: Permission): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error("unauthenticated");
  const auth = await getAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) throw new Error("unauthenticated");
  const allowed = await hasPermission(email, permission);
  if (!allowed) throw new Error("forbidden");
  return email;
}

// Convenience: returns email + full permission set in one call, useful for
// pages that need to branch on multiple permissions without extra round-trips.
export async function getSession(): Promise<{ email: string; permissions: Permission[] } | null> {
  if (!isSupabaseConfigured()) return null;
  const auth = await getAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const permissions = await getPermissions(email);
  if (!permissions.includes("admin.access")) return null;
  return { email, permissions };
}
