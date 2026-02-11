import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function normalizeRole(input: unknown): "viewer" | "client" | "manager" | "admin" | "editor" | null {
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

export async function requireEditorPin(client: ReturnType<typeof createClient>, pin: string) {
  const normalizedPin = String(pin || "").trim();
  if (!/^\d{4}$/.test(normalizedPin)) {
    throw new Error("Forbidden: editor PIN required");
  }

  const pinSha256 = await sha256Hex(normalizedPin);
  const { data, error } = await client
    .from("app_pins")
    .select("role, author, active")
    .eq("pin_sha256", pinSha256)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message || "Forbidden: editor PIN required");

  const isActive = data ? (data.active ?? true) : false;
  const role = normalizeRole(data?.role);

  if (!data || !role || !isActive || !["editor", "admin"].includes(role)) {
    throw new Error("Forbidden: editor PIN required");
  }

  return { author: String(data.author || "Editor"), role };
}

export function cleanName(name: string) {
  return String(name || "").trim().replace(/[^a-z0-9_\-]/gi, "_");
}
