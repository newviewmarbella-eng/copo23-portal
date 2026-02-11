import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json } from "../_accounting_shared/utils.ts";

type Role = "viewer" | "client" | "manager" | "admin" | "editor";

const EDITOR_ALLOWED_ROLES = new Set<Role>(["editor", "admin"]);

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") return json({ valid: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();
    const requiredRoleRaw = body?.requiredRole;
    const hasRequiredRole = requiredRoleRaw !== undefined && requiredRoleRaw !== null && String(requiredRoleRaw).trim() !== "";
    const requiredRole = hasRequiredRole ? normalizeRole(requiredRoleRaw) : null;

    if (!/^\d{4}$/.test(pin)) {
      return json({ valid: false, error: "Invalid PIN" }, 401);
    }

    if (hasRequiredRole && !requiredRole) {
      return json({ valid: false, error: "Invalid requiredRole" }, 400);
    }

    if (requiredRole && requiredRole !== "editor") {
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
      .from("app_pins")
      .select("role, author, active")
      .eq("pin_sha256", pinSha256)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[verify_pin] lookup error", error);
      return json({ valid: false, error: "Internal server error" }, 500);
    }

    const role = normalizeRole(data?.role);
    const isActive = data ? (data.active ?? true) : false;

    if (!data || !role || !isActive) {
      return json({ valid: false, error: "Invalid PIN" }, 401);
    }

    if (requiredRole === "editor" && !EDITOR_ALLOWED_ROLES.has(role)) {
      return json({ valid: false, error: "Forbidden: editor PIN required" }, 403);
    }

    return json({ valid: true, role, author: String(data.author || "") }, 200);
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return json({ valid: false, error: "Internal server error" }, 500);
  }
});
