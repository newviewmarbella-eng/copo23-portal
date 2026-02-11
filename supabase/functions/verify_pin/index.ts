import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, json, resolvePinRole } from "../_accounting_shared/utils.ts";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const attemptsByKey = new Map<string, number[]>();

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

function hasPinSecret(name: string) {
  return Boolean((Deno.env.get(name) || "").trim());
}

function missingPinSecrets() {
  const requiredSecrets = ["ACCOUNTING_EDITOR_PINS", "ACCOUNTING_VIEWER_PINS"];
  return requiredSecrets.filter((secret) => !hasPinSecret(secret));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, role: null, error: "method_not_allowed" }, 200);

  try {
    const missingSecrets = missingPinSecrets();
    if (missingSecrets.length > 0) {
      console.error(`[verify_pin] missing required PIN secrets: ${missingSecrets.join(", ")}`);
      return json({ valid: false, role: null, error: "missing_pin_secrets" }, 200);
    }

    const body = await req.json();
    const pin = String(body?.pin || "").trim();
    const requestedRole = String(body?.requiredRole || "").trim().toLowerCase();
    const sessionId = String(body?.sessionId || "").trim();
    if (!pin) return json({ valid: false, role: null, error: "invalid_pin" }, 200);

    const key = getRateLimitKey(req, sessionId);
    if (isRateLimited(key)) {
      return json({ valid: false, role: null, error: "too_many_attempts" }, 200);
    }

    const role = resolvePinRole(pin);
    if (!role) return json({ valid: false, role: null, error: "invalid_pin" }, 200);

    if (requestedRole === "editor" && role !== "editor") {
      return json({ valid: false, role, error: "editor_required" }, 200);
    }

    return json({ valid: true, role }, 200);
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return json({ valid: false, role: null, error: "invalid_pin_request" }, 200);
  }
});
