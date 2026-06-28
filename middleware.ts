import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { contentSecurityPolicy } from "./src/lib/apiPolicy.mjs";

const CSP_KEY =
  process.env.CSP_REPORT_ONLY === "1"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
const CSP_VALUE = contentSecurityPolicy();

function applyCSP(res: NextResponse) {
  res.headers.set(CSP_KEY, CSP_VALUE);
  return res;
}

// Sets CSP on every HTML route. Also keeps the admin auth session fresh.
export async function middleware(req: NextRequest) {
  const isAdmin = req.nextUrl.pathname.startsWith("/admin");

  if (!isAdmin) {
    return applyCSP(NextResponse.next({ request: req }));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let res = applyCSP(NextResponse.next({ request: req }));
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = applyCSP(NextResponse.next({ request: req }));
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
