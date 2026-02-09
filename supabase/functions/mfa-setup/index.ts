import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_SETUP_CODE_HASH = Deno.env.get("ADMIN_SETUP_CODE_HASH") ?? "";

const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") ?? "*";
const allowedOrigins = allowedOriginsRaw
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function resolveCorsOrigin(origin: string | null) {
  if (allowedOriginsRaw === "*") return "*";
  if (!origin) return "";
  return allowedOrigins.includes(origin) ? origin : "";
}

function corsHeaders(origin: string | null) {
  const resolved = resolveCorsOrigin(origin);
  return {
    "Access-Control-Allow-Origin": resolved || "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function randomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendEmail(to: string, code: string) {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return new Response("Missing email config", { status: 500, headers: corsHeaders(null) });
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: "Hurly Security Verification Code",
      html: `
        <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
          <h2>Hurly Security Check</h2>
          <p>Use this one-time code to confirm you are enabling MFA.</p>
          <div style="font-size:24px;font-weight:700;letter-spacing:4px;margin:16px 0;">${code}</div>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
      text: `Hurly Security Check\nYour code: ${code}\nThis code expires in 10 minutes.`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return new Response(text || "Resend error", { status: 502, headers: corsHeaders(null) });
  }
  return new Response("ok", { status: 200, headers: corsHeaders(null) });
}

async function supabaseFetch(path: string, opts: RequestInit = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      ...(opts.headers || {}),
    },
  });
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    const headers = corsHeaders(origin);
    if (headers["Access-Control-Allow-Origin"] === "null") {
      return new Response("Origin not allowed", { status: 403, headers });
    }
    return new Response("ok", { headers });
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders(origin) });
  }

  const action = payload?.action;
  const email = String(payload?.email || "").trim().toLowerCase();
  const code = String(payload?.code || "").trim();

  if (action === "check_admin") {
    if (!ADMIN_SETUP_CODE_HASH) {
      return new Response("Admin setup code not configured", { status: 500, headers: corsHeaders(origin) });
    }
    if (!code) {
      return new Response("Missing admin code", { status: 400, headers: corsHeaders(origin) });
    }
    const inputHash = await sha256(code);
    if (inputHash !== ADMIN_SETUP_CODE_HASH) {
      return new Response("Unauthorized setup attempt detected.", { status: 401, headers: corsHeaders(origin) });
    }
    return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Missing Supabase service role config", { status: 500, headers: corsHeaders(origin) });
  }

  if (!email) {
    return new Response("Missing email", { status: 400, headers: corsHeaders(origin) });
  }

  if (action === "send") {
    const oneTimeCode = randomCode();
    const codeHash = await sha256(oneTimeCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabaseFetch(`mfa_setup_codes`, {
      method: "POST",
      body: JSON.stringify({ email, code_hash: codeHash, expires_at: expiresAt, used: false }),
    });

    return await sendEmail(email, oneTimeCode);
  }

  if (action === "verify") {
    if (!code) {
      return new Response("Missing code", { status: 400, headers: corsHeaders(origin) });
    }
    const codeHash = await sha256(code);
    const nowIso = new Date().toISOString();

    const res = await supabaseFetch(
      `mfa_setup_codes?email=eq.${encodeURIComponent(email)}&code_hash=eq.${codeHash}&used=eq.false&expires_at=gt.${nowIso}&order=created_at.desc&limit=1`,
      { method: "GET" }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(text || "Lookup failed", { status: 400, headers: corsHeaders(origin) });
    }

    const rows = await res.json();
    if (!rows || rows.length === 0) {
      return new Response("Invalid or expired code", { status: 401, headers: corsHeaders(origin) });
    }

    const id = rows[0].id;
    await supabaseFetch(`mfa_setup_codes?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ used: true }),
    });

    return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  }

  return new Response("No action", { status: 200, headers: corsHeaders(origin) });
});
