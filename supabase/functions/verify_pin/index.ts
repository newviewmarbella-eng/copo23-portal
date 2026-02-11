import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json } from "../_accounting_shared/utils.ts";

type Role = "viewer" | "foreman" | "editor";

const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  foreman: 2,
  editor: 3,
};

function normalizeRole(input: unknown): Role | null {
  const value = String(input || "").trim().toLowerCase();
  if (value === "manager") return "foreman";
  if (value === "viewer" || value === "foreman" || value === "editor") return value;
  return null;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();
    const requiredRole = body?.requiredRole === undefined ? undefined : normalizeRole(body.requiredRole);

    if (!/^\d{4}$/.test(pin)) {
      return json({ valid: false, error: "Invalid PIN" }, 401);
    }

    if (body?.requiredRole !== undefined && !requiredRole) {
      return json({ valid: false, error: "Invalid requiredRole" }, 400);
    }

    const pinSha256 = await sha256Hex(pin);

    let admin;
    try {
      admin = getAdminClient();
    } catch (error) {
      console.error("[verify_pin] missing service role configuration", error);
      return json({ valid: false, error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required" }, 500);
    }

    const { data, error } = await admin
      .from("accounting_members")
      .select("role, author, active, is_active")
      .or(`pin_sha256.eq.${pinSha256},pin_hash.eq.${pinSha256}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[verify_pin] lookup error", error);
      return json({ valid: false, error: "Internal server error" }, 500);
    }

    const isActive = data ? (data.active ?? data.is_active ?? true) : false;
    const role = normalizeRole(data?.role);
    if (!data || !role || !isActive) {
      return json({ valid: false, error: "Invalid PIN" }, 401);
    }

    if (requiredRole && ROLE_LEVEL[role] < ROLE_LEVEL[requiredRole]) {
      return json({ valid: false, error: `Forbidden: ${requiredRole} PIN required` }, 403);
    }

    return json({ valid: true, role, author: String(data.author || "") }, 200);
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return json({ valid: false, error: "Internal server error" }, 500);
  }
});
