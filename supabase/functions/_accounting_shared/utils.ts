import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function parsePinsFromSecret(secretName: string): Set<string> {
  const raw = Deno.env.get(secretName) ?? "";
  return new Set(
    raw
      .split(/[\s,;]+/g)
      .map((pin) => pin.trim())
      .filter(Boolean),
  );
}

export function resolvePinRole(pin: string): "editor" | "viewer" | "manager" | null {
  const normalized = String(pin || "").trim();
  if (!normalized) return null;

  const editorPins = parsePinsFromSecret("ACCOUNTING_EDITOR_PINS");
  const viewerPins = parsePinsFromSecret("ACCOUNTING_VIEWER_PINS");
  const managerPins = parsePinsFromSecret("ACCOUNTING_MANAGER_PINS");

  if (editorPins.has(normalized)) return "editor";
  if (viewerPins.has(normalized)) return "viewer";
  if (managerPins.has(normalized)) return "manager";
  return null;
}

export async function requireEditorPin(_client: ReturnType<typeof createClient>, pin: string) {
  const role = resolvePinRole(pin);
  if (role !== "editor") {
    throw new Error("Forbidden: editor PIN required");
  }
  return { author: "Editor", role };
}

export function cleanName(name: string) {
  return String(name || "").trim().replace(/[^a-z0-9_\-]/gi, "_");
}
