import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

function monday(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const client = getAdminClient();
    await requireEditorPin(client, String(body?.pin || ""));

    if (body?.mode === "list_week") {
      const from = body?.week_start || monday();
      const toDate = new Date(from + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + 6);
      const to = toDate.toISOString().slice(0, 10);
      const { data, error } = await client
        .from("accounting_timesheets")
        .select("*, accounting_workers(name)")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw error;
      return json({
        items: (data || []).map((r: any) => ({ ...r, worker_name: r.accounting_workers?.name || "" })),
      });
    }

    const hours = Number(body?.hours || 8);
    const dayRate = Number(body?.day_rate || 0);
    const totalCost = Number(((hours / 8) * dayRate).toFixed(2));
    const payload = {
      id: body?.id || crypto.randomUUID(),
      worker_id: body?.worker_id,
      date: body?.date,
      hours,
      day_rate: dayRate,
      total_cost: totalCost,
      status: body?.status || "pending",
      notes: body?.notes || null,
    };
    const { data, error } = await client.from("accounting_timesheets").upsert(payload).select("*").single();
    if (error) throw error;
    return json({ item: data });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
