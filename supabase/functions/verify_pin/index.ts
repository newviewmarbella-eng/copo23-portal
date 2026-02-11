import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const pin = String(body?.pin || "").trim();
    if (!pin) return json({ valid: false, error: "PIN is required" }, 400);

    const client = getAdminClient();
    const user = await requireEditorPin(client, pin);

    return json({ valid: true, role: user.role, author: user.author || null });
  } catch (error) {
    return json({ valid: false, error: (error as Error).message }, 401);
  }
});
