import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env vars");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function normalizeRole(input: unknown): "viewer" | "editor" | null {
  const value = String(input || "").trim().toLowerCase();
  if (value === "viewer" || value === "editor") return value;
  return null;
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function lookupPin(client: ReturnType<typeof createClient>, pin: string) {
  const normalizedPin = String(pin || "").trim();
  if (!/^\d{4}$/.test(normalizedPin)) return { valid: false as const };

  const pinHash = await sha256Hex(normalizedPin);
  const { data, error } = await client
    .from("app_pins")
    .select("role, author, active")
    .eq("pin_hash", pinHash)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message || "PIN lookup failed");

  const role = normalizeRole(data?.role);
  const isActive = data ? (data.active ?? true) : false;

  if (!data || !role || !isActive) return { valid: false as const };

  return {
    valid: true as const,
    role,
    author: String(data.author || ""),
  };
}

export async function requireEditorPin(client: ReturnType<typeof createClient>, pin: string) {
  const pinResult = await lookupPin(client, pin);
  if (!pinResult.valid || pinResult.role !== "editor") {
    throw new Error("editor PIN required");
  }
  return pinResult;
}

export function cleanName(name: string) {
  return String(name || "").trim().replace(/[^a-z0-9_\-]/gi, "_");
}
