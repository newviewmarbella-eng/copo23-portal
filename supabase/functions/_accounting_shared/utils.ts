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

export async function requireEditorPin(client: ReturnType<typeof createClient>, pin: string) {
  const editorPins = new Set(["4444", "2244"]);
  if (editorPins.has(pin)) return { author: "Editor", role: "editor" };

  const { data, error } = await client.rpc("rpc_pin_login", { p_pin: pin });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.role || String(row.role).toLowerCase() !== "editor") {
    throw new Error("Forbidden: editor PIN required");
  }
  return row;
}

export function cleanName(name: string) {
  return String(name || "").trim().replace(/[^a-z0-9_\-]/gi, "_");
}
