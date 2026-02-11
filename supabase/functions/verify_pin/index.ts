import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json } from "../_accounting_shared/utils.ts";

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

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();
    const sessionId = String(body?.sessionId || "").trim();
    if (!pin) return json({ valid: false, error: "Invalid PIN" }, 401);

    const key = getRateLimitKey(req, sessionId);
    if (isRateLimited(key)) {
      return json({ valid: false, error: "Too many attempts" }, 429);
    }

    const pinHash = await sha256Hex(pin);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("accounting_members")
      .select("role, author")
      .eq("pin_hash", pinHash)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("[verify_pin] lookup error", error);
      return json({ valid: false, error: "Invalid PIN" }, 401);
    }

    if (!data?.role) {
      return json({ valid: false, error: "Invalid PIN" }, 401);
    }

    return json({ valid: true, role: data.role, author: data.author || "" }, 200);
  } catch (error) {
    console.error("[verify_pin] unexpected error", error);
    return json({ valid: false, error: "invalid_pin_request" }, 400);
  }
});
