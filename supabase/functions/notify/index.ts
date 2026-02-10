import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const ALERT_RECIPIENT = Deno.env.get("ALERT_RECIPIENT") ?? "";
const PAYRUN_RECIPIENT = Deno.env.get("PAYRUN_RECIPIENT") ?? "cavelellis103@gmail.com";

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

const TEMPLATE_ID = "f898ee8e-2901-44d5-827f-810b79f40840";

async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  templateData: {
    TITLE: string;
    INTRO: string;
    NAME: string;
    TABLE: string;
    RECORD_ID: string;
    STATUS: string;
    TOTAL: string;
    FOOTER: string;
  };
  text?: string;
}) {
  if (!RESEND_API_KEY || !RESEND_FROM || !opts.to) {
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
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      template: {
        id: TEMPLATE_ID,
        variables: opts.templateData,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Resend error:", text || "unknown");
    return new Response(text || "Resend error", { status: 502, headers: corsHeaders(null) });
  }
  return new Response("ok", { status: 200, headers: corsHeaders(null) });
}

function baseTemplateData(overrides: Partial<{
  TITLE: string;
  INTRO: string;
  NAME: string;
  TABLE: string;
  RECORD_ID: string;
  STATUS: string;
  TOTAL: string;
  FOOTER: string;
}>) {
  return {
    TITLE: overrides.TITLE || "Hurly Notification",
    INTRO: overrides.INTRO || "A new update was detected in Hurly.",
    NAME: overrides.NAME || "-",
    TABLE: overrides.TABLE || "-",
    RECORD_ID: overrides.RECORD_ID || "-",
    STATUS: overrides.STATUS || "-",
    TOTAL: overrides.TOTAL || "-",
    FOOTER: overrides.FOOTER || "Hurly • Automated Email • © 2026 Hurly",
  };
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

  const table = payload?.table;
  const type = payload?.type;
  const record = payload?.record;
  const old = payload?.old_record;
  const to = payload?.to || ALERT_RECIPIENT;
  const toList = Array.isArray(to) ? to : (to ? [to] : []);

  // Client error reports
  if (payload?.event === "client_error") {
    return await sendEmail({
      to: toList.length ? toList : ALERT_RECIPIENT,
      subject: "Hurly: Client Error",
      templateData: baseTemplateData({
        TITLE: "Client Error",
        INTRO: payload.message || "Unknown client error.",
        NAME: "-",
        TABLE: "client",
        RECORD_ID: "-",
        STATUS: "Error",
        TOTAL: "-",
        FOOTER: payload.url || "Hurly • Automated Email",
      }),
      text: `${payload.message || "Client error"}\n${payload.url || ""}\n${payload.stack || ""}`,
    });
  }

  if (payload?.event === "payroll_report") {
    const reportUrl = payload?.report_url || "-";
    return await sendEmail({
      to: toList.length ? toList : ALERT_RECIPIENT,
      subject: "Hurly Payroll Report Ready",
      templateData: baseTemplateData({
        TITLE: "Payroll Report Ready",
        INTRO: `Your payroll report is ready. Download it here: ${reportUrl}`,
        NAME: "-",
        TABLE: "payroll_report",
        RECORD_ID: payload?.period || "-",
        STATUS: "Ready",
        TOTAL: payload?.total_paid || "-",
        FOOTER: payload?.total_pending ? `Pending: ${payload.total_pending}` : "Hurly • Automated Email • © 2026 Hurly",
      }),
      text: `Payroll report ready\n${reportUrl}`,
    });
  }

  // DB webhook payloads
  if (table && type) {
    if (table === "payroll" && type === "UPDATE" && record?.status === "Final" && old?.status !== "Final") {
      const entries = Array.isArray(record?.entries) ? record.entries : [];
      const payrunRecipients = Array.from(new Set([...(toList.length ? toList : [ALERT_RECIPIENT]), PAYRUN_RECIPIENT].filter(Boolean)));
      return await sendEmail({
        to: payrunRecipients,
        subject: `Hurly Payroll Final: ${record?.pay_period || ""}`,
        templateData: baseTemplateData({
          TITLE: "Payroll Finalized",
          INTRO: `Payroll run ${record?.pay_period || "-"} has been finalized.`,
          NAME: "-",
          TABLE: "payroll",
          RECORD_ID: record?.id || "-",
          STATUS: record?.status || "Final",
          TOTAL: String(record?.total || 0),
          FOOTER: `Employees: ${record?.employees_count || entries.length}`,
        }),
      });
    }

    if (type === "INSERT") {
      const name = record?.name || record?.employee_name || "-";
      const intro =
        name !== "-"
          ? `A new ${table} record was created for ${name}.`
          : `A new ${table} record was created.`;
      return await sendEmail({
        to: toList.length ? toList : ALERT_RECIPIENT,
        subject: `Hurly: New ${table} record`,
        templateData: baseTemplateData({
          TITLE: "New Record Added",
          INTRO: intro,
          NAME: name,
          TABLE: table,
          RECORD_ID: record?.id || "-",
          STATUS: record?.status || "-",
          TOTAL: String(record?.total || "-"),
          FOOTER: "Hurly • Automated Email",
        }),
      });
    }
  }

  return new Response("No action", { status: 200, headers: corsHeaders(origin) });
});
