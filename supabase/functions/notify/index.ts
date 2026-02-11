import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const ALERT_RECIPIENT = Deno.env.get("ALERT_RECIPIENT") ?? "";
const PAYRUN_RECIPIENT = Deno.env.get("PAYRUN_RECIPIENT") ?? "cavelellis103@gmail.com";
const OVERTIME_RECIPIENT = Deno.env.get("OVERTIME_RECIPIENT") ?? "cavelellis103@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") ?? "*";
const allowedOrigins = allowedOriginsRaw
  .split(",")
ttp://127.0.0.1:5500,https://your-  .map((origin) => origin.trim())
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
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const primaryRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipients,
      subject: opts.subject,
      template: {
        id: TEMPLATE_ID,
        variables: opts.templateData,
      },
    }),
  });
  if (primaryRes.ok) {
    return new Response("ok", { status: 200, headers: corsHeaders(null) });
  }

  const primaryErr = await primaryRes.text().catch(() => "");
  console.error("Resend template send failed:", primaryErr || "unknown");

  const fallbackHtml = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
      <h2>${opts.templateData.TITLE}</h2>
      <p>${opts.templateData.INTRO}</p>
      <p><strong>Name:</strong> ${opts.templateData.NAME}</p>
      <p><strong>Table:</strong> ${opts.templateData.TABLE}</p>
      <p><strong>Record:</strong> ${opts.templateData.RECORD_ID}</p>
      <p><strong>Status:</strong> ${opts.templateData.STATUS}</p>
      <p><strong>Total:</strong> ${opts.templateData.TOTAL}</p>
      <p>${opts.templateData.FOOTER}</p>
    </div>
  `;
  const fallbackText = opts.text || [
    opts.templateData.TITLE,
    opts.templateData.INTRO,
    `Name: ${opts.templateData.NAME}`,
    `Table: ${opts.templateData.TABLE}`,
    `Record: ${opts.templateData.RECORD_ID}`,
    `Status: ${opts.templateData.STATUS}`,
    `Total: ${opts.templateData.TOTAL}`,
    opts.templateData.FOOTER,
  ].join("\n");
  const fallbackRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipients,
      subject: opts.subject,
      html: fallbackHtml,
      text: fallbackText,
    }),
  });
  if (!fallbackRes.ok) {
    const fallbackErr = await fallbackRes.text().catch(() => "");
    console.error("Resend fallback send failed:", fallbackErr || "unknown");
    return new Response(fallbackErr || primaryErr || "Resend error", { status: 502, headers: corsHeaders(null) });
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

async function getAuthenticatedUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  const apiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!token || !SUPABASE_URL || !apiKey) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
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
  const protectedEvents = new Set([
    "client_error",
    "payroll_report",
    "attendance_missing",
    "overtime_added",
    "attendance_daily_summary",
  ]);
  if (protectedEvents.has(String(payload?.event || ""))) {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders(origin) });
    }
  }

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

  if (payload?.event === "attendance_missing") {
    return await sendEmail({
      to: toList.length ? toList : ALERT_RECIPIENT,
      subject: `Hurly Attendance Missing: ${payload?.date || "-"}`,
      templateData: baseTemplateData({
        TITLE: "Attendance Missing",
        INTRO: `No attendance was recorded for ${payload?.date || "today"}${payload?.site ? ` at ${payload.site}` : ""}.`,
        NAME: "-",
        TABLE: "attendance",
        RECORD_ID: payload?.date || "-",
        STATUS: "Missing",
        TOTAL: "-",
        FOOTER: "Hurly Attendance Alert",
      }),
      text: `No attendance recorded for ${payload?.date || "today"}${payload?.site ? ` at ${payload.site}` : ""}.`,
    });
  }

  if (payload?.event === "overtime_added") {
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const overtimeRecipients = Array.from(
      new Set(
        [
          ...(toList.length ? toList : [ALERT_RECIPIENT]),
          OVERTIME_RECIPIENT,
        ].filter(Boolean),
      ),
    );
    const names = Array.from(
      new Set(entries.map((item: any) => String(item?.employee_name || "-")).filter(Boolean)),
    );
    const namesLine = names.length ? names.join(", ") : "-";
    const lines = entries
      .map((item: any) => `${item?.employee_name || "-"} | ${item?.date || "-"} | OT ${item?.overtime_hours ?? item?.overtimeHours ?? 0}h`)
      .slice(0, 20);
    const totalOt = entries.reduce((sum: number, item: any) => {
      const n = Number(item?.overtime_hours ?? item?.overtimeHours ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return await sendEmail({
      to: overtimeRecipients,
      subject: `Hurly Overtime Alert (${entries.length})`,
      templateData: baseTemplateData({
        TITLE: "Overtime Added",
        INTRO: entries.length
          ? `Overtime was added for ${namesLine}. (${entries.length} record(s))`
          : "Overtime was added.",
        NAME: entries[0]?.employee_name || "-",
        TABLE: "attendance",
        RECORD_ID: entries[0]?.date || "-",
        STATUS: "Overtime",
        TOTAL: `${totalOt.toFixed(2)} hrs`,
        FOOTER: lines.join(" | ") || "Hurly Overtime Alert",
      }),
      text: lines.length ? lines.join("\n") : "Overtime added.",
    });
  }

  if (payload?.event === "attendance_daily_summary") {
    const flagged = Array.isArray(payload?.flagged) ? payload.flagged : [];
    const flaggedLines = flagged
      .map((item: any) => {
        const hours = Number(item?.hours || 0);
        const mark = item?.overtime || hours > 8 ? "[OT]" : "";
        return `${mark} ${item?.employee_name || "-"} (${hours || 0}h)`;
      })
      .slice(0, 25);
    return await sendEmail({
      to: toList.length ? toList : ALERT_RECIPIENT,
      subject: `Hurly End-of-Day Summary: ${payload?.date || "-"}`,
      templateData: baseTemplateData({
        TITLE: "Attendance End-of-Day Summary",
        INTRO: `Date: ${payload?.date || "-"} | Records: ${payload?.total_records ?? 0} | Overtime/8h+: ${payload?.overtime_records ?? flagged.length}`,
        NAME: "-",
        TABLE: "attendance",
        RECORD_ID: payload?.date || "-",
        STATUS: "Summary",
        TOTAL: String(payload?.total_records ?? 0),
        FOOTER: flaggedLines.join(" | ") || "No overtime or >8h records.",
      }),
      text: [
        `Date: ${payload?.date || "-"}`,
        `Records: ${payload?.total_records ?? 0}`,
        `Overtime/8h+: ${payload?.overtime_records ?? flagged.length}`,
        flaggedLines.length ? flaggedLines.join("\n") : "No overtime or >8h records.",
      ].join("\n"),
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

    // Generic INSERT alerts are intentionally disabled to reduce alert noise.
  }

  return new Response("No action", { status: 200, headers: corsHeaders(origin) });
});

