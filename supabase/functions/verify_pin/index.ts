import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json } from "../_accounting_shared/utils.ts";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ALLOWED_REQUIRED_ROLES = new Set(["viewer", "editor", "manager"] as const);
const attemptsByKey = new Map<string, number[]>();

type RequiredRole = "viewer" | "editor" | "manager";

type MemberRole = RequiredRole;

function getRateLimitKey(req: Request, sessionId: string) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  return `${sessionId || "anon"}:${ip}`;
}

function isRateLimited(key: string) {
  const now = Date.now();
  const attempts = (attemptsByKey.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  attempts.push(now);
  attemptsByKey.set(key, attempts);
  return attempts.length > RATE_LIMIT_MAX;
}

function roleSatisfiesRequirement(role: MemberRole, requiredRole?: RequiredRole) {
  if (!requiredRole) return true;
  if (requiredRole === "viewer") return role === "viewer";
  if (requiredRole === "editor") return role === "editor";
  if (requiredRole === "manager") return role === "manager";
  return false;
}

function resolveRequiredRole(input: unknown): RequiredRole | undefined {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (!ALLOWED_REQUIRED_ROLES.has(normalized as RequiredRole)) return undefined;
  return normalized as RequiredRole;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();
    const requiredRole = resolveRequiredRole(body?.requiredRole);
    const sessionId = String(body?.sessionId || "").trim();

    if (!pin) return json({ valid: false, error: "Invalid PIN" }, 200);

    const key = getRateLimitKey(req, sessionId);
    if (isRateLimited(key)) {
      return json({ valid: false, error: "Too many attempts" }, 429);
    }

    let admin;
    try {
      admin = getAdminClient();
    } catch (error) {
      console.error("[verify_pin] missing service role configuration", error);
      return json({ valid: false, error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required" }, 500);
    }

    const { data, error } = await admin
      .from("accounting_members")
      .select("role, author")
      .eq("pin", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[verify_pin] lookup error", error);
      return json({ valid: false, error: "Internal server error" }, 500);
    }

    if (!data?.role) {
      return json({ valid: false, error: "Invalid PIN" }, 200);
    }

    const role = String(data.role).toLowerCase() as MemberRole;
    const author = String(data.author || "").trim();

    if (!roleSatisfiesRequirement(role, requiredRole)) {
      const forbiddenMsg = requiredRole === "editor" ? "editor PIN required" : `${requiredRole} PIN required`;
      return json({ valid: false, error: forbiddenMsg }, 200);
    }

    return json({ valid: true, role, author }, 200);
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return json({ valid: false, error: "Internal server error" }, 500);
  }
});
