import { NextRequest, NextResponse } from "next/server";

const TARGET_HOST = "https://venezuela-terremoto-c4gafbfpc0dadpcj.eastus-01.azurewebsites.net";

async function handleProxy(req: NextRequest) {
  const url = new URL(req.url);
  const targetUrl = new URL("/health", TARGET_HOST);

  const headers = new Headers(req.headers);
  headers.set("host", targetUrl.host);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
    });

    const body = await res.blob();
    return new NextResponse(body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return NextResponse.json({ error: "Proxy connection error" }, { status: 502 });
  }
}

export { handleProxy as GET };
