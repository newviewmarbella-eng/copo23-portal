import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, lookupPin } from "../_accounting_shared/utils.ts";

const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: responseHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ valid: false, error: "Method not allowed" }), { status: 405, headers: responseHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pin = String(body?.pin ?? "").trim();
    const requiredRole = body?.requiredRole === "editor" ? "editor" : undefined;

    const admin = getAdminClient();
    const pinResult = await lookupPin(admin, pin);

    if (!pinResult.valid) {
      return new Response(JSON.stringify({ valid: false, error: "Invalid PIN" }), { status: 401, headers: responseHeaders });
    }

    if (requiredRole === "editor" && pinResult.role !== "editor") {
      return new Response(JSON.stringify({ valid: false, error: "Forbidden: editor PIN required" }), { status: 403, headers: responseHeaders });
    }

    return new Response(
      JSON.stringify({ valid: true, role: pinResult.role, author: pinResult.author }),
      { status: 200, headers: responseHeaders },
    );
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return new Response(JSON.stringify({ valid: false, error: "Internal server error" }), { status: 500, headers: responseHeaders });
  }
});
