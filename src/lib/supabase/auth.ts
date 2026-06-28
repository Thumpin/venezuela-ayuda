import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types.gen";

// Cookie-backed Supabase client for ADMIN auth sessions (uses the publishable
// key, like any browser auth). Public visitors never touch this — only the
// /admin area. Writes still go through the service-key client elsewhere.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function getAuthClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(url!, key!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — cookie writes are a no-op here;
          // the middleware refreshes the session instead.
        }
      },
    },
  });
}
