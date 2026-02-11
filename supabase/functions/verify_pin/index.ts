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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const missingSecrets = missingPinSecrets();
    if (missingSecrets.length > 0) {
      console.error(`[verify_pin] missing required PIN secrets: ${missingSecrets.join(", ")}`);
      return json({ ok: false, error: "missing_pin_secrets" }, 500);
    }

    const body = await req.json();
    const pin = String(body?.pin || "").trim();
    const sessionId = String(body?.sessionId || "").trim();
    if (!pin) return json({ ok: false, error: "PIN is required" }, 400);

    const key = getRateLimitKey(req, sessionId);
    if (isRateLimited(key)) {
      return json({ ok: false, error: "Too many attempts" }, 429);
    }

    const role = resolvePinRole(pin);
    if (!role) return json({ ok: false, error: "Invalid PIN" }, 401);

    return json({ ok: true, role });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 400);
  }
});
