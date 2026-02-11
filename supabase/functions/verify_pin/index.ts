import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, lookupPin } from "../_accounting_shared/utils.ts";

function resolveCorsOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "*";
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return origin;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return origin;
  return "*";
}

serve(async (req) => {
  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": resolveCorsOrigin(req), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ valid: false, error: "method_not_allowed" }), { status: 405, headers });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pin = String(body?.pin ?? req.headers.get("x-pin") ?? "").trim();

    let admin;
    try {
      admin = getAdminClient();
    } catch (error) {
      console.error("[verify_pin] missing service role configuration", error);
      return new Response(JSON.stringify({ valid: false, error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required" }), { status: 500, headers });
    }

    const pinResult = await lookupPin(admin, pin);
    if (!pinResult.valid) {
      return new Response(JSON.stringify({ valid: false }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ valid: true, role: pinResult.role, author: pinResult.author }), { status: 200, headers });
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return new Response(JSON.stringify({ valid: false, error: "Internal server error" }), { status: 500, headers });
  }
});
