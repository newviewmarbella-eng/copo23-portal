import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient } from "../_accounting_shared/utils.ts";

type Role = "viewer" | "client" | "manager" | "admin" | "editor";

function normalizeRole(input: unknown): Role | null {
  const value = String(input || "").trim().toLowerCase();
  if (value === "foreman") return "manager";
  if (value === "viewer" || value === "client" || value === "manager" || value === "admin" || value === "editor") return value;
  return null;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

  if (req.method !== "POST") return new Response(JSON.stringify({ valid: false, error: "method_not_allowed" }), { status: 405, headers });

  try {
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();

    if (!/^\d{4}$/.test(pin)) {
      return new Response(JSON.stringify({ valid: false, error: "Invalid PIN" }), { status: 401, headers });
    }

    const pinHash = await sha256Hex(pin);

    let admin;
    try {
      admin = getAdminClient();
    } catch (error) {
      console.error("[verify_pin] missing service role configuration", error);
      return new Response(JSON.stringify({ valid: false, error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required" }), { status: 500, headers });
    }

    const { data, error } = await admin
      .from("accounting_members")
      .select("role, author, active")
      .eq("pin_hash", pinHash)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[verify_pin] lookup error", error);
      return new Response(JSON.stringify({ valid: false, error: "Internal server error" }), { status: 500, headers });
    }

    const role = normalizeRole(data?.role);

    if (!data || !role) {
      return new Response(JSON.stringify({ valid: false, error: "Invalid PIN" }), { status: 401, headers });
    }

    return new Response(JSON.stringify({ valid: true, role, author: String(data.author || ""), active: true }), { status: 200, headers });
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return new Response(JSON.stringify({ valid: false, error: "Internal server error" }), { status: 500, headers });
  }
});
