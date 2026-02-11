import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const client = getAdminClient();
    await requireEditorPin(client, String(body?.pin || ""));

    if (body?.mode === "list" || body?.mode === "list_active") {
      let query = client.from("accounting_workers").select("*").order("name");
      if (body.mode === "list_active") query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return json({ items: data || [] });
    }

    const payload = {
      id: body?.id || crypto.randomUUID(),
      name: String(body?.name || "").trim(),
      day_rate: Number(body?.day_rate || 0),
      vat_applicable: !!body?.vat_applicable,
      active: body?.active !== false,
    };
    const { data, error } = await client.from("accounting_workers").upsert(payload).select("*").single();
    if (error) throw error;
    return json({ item: data });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
