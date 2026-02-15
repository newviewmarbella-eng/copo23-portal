import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const client = getAdminClient();
    await requireEditorPin(client, String(body?.pin || ""));

    const payload = {
      id: body?.id || crypto.randomUUID(),
      type: body?.type,
      vendor_or_client: body?.vendor_or_client ?? "",
      invoice_number: body?.invoice_number ?? null,
      date: body?.date,
      subtotal: Number(body?.subtotal || 0),
      vat: Number(body?.vat || 0),
      total: Number(body?.total || 0),
      category: body?.category ? String(body.category) : null,
      subcategory: body?.subcategory ?? null,
      payment_method: body?.payment_method ?? null,
      status: body?.status || "pending",
      file_path: body?.file_path ?? null,
      concept_accounting: body?.concept_accounting ?? null,
      notes: body?.notes ?? null,
    };

    const { data, error } = await client.from("accounting_invoices").upsert(payload).select("*").single();
    if (error) throw error;
    return json({ item: data });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
