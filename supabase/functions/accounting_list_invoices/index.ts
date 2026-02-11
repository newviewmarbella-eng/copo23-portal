import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const client = getAdminClient();
    await requireEditorPin(client, String(body?.pin || ""));
    const f = body?.filters || {};

    let query = client.from("accounting_invoices").select("*").order("date", { ascending: false }).limit(300);
    if (f.type) query = query.eq("type", f.type);
    if (f.status) query = query.eq("status", f.status);
    if (f.category) query = query.eq("category", Number(f.category));
    if (f.date_from) query = query.gte("date", f.date_from);
    if (f.date_to) query = query.lte("date", f.date_to);
    if (f.search) query = query.ilike("vendor_or_client", `%${f.search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return json({ items: data || [] });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
