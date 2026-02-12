import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { cleanName, corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

const BUCKET = "copo23-invoices";

function parseNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const pin = String(req.headers.get("x-pin") || body?.pin || "").trim();

    const client = getAdminClient();
    try {
      await requireEditorPin(client, pin);
    } catch (_) {
      return json({ error: "editor PIN required" }, 403);
    }

    if (action === "create_invoice") {
      const payload = {
        id: body?.id || crypto.randomUUID(),
        type: String(body?.type || "expense"),
        vendor_or_client: String(body?.vendor_or_client || ""),
        invoice_number: body?.invoice_number ?? null,
        date: String(body?.date || ""),
        subtotal: parseNumber(body?.subtotal),
        vat: parseNumber(body?.vat),
        total: parseNumber(body?.total),
        category: body?.category ? parseNumber(body.category) : null,
        subcategory: body?.subcategory ?? null,
        payment_method: body?.payment_method ?? null,
        status: String(body?.status || "pending"),
        file_path: body?.file_path ?? null,
        file_name: body?.file_name ?? null,
        file_type: body?.file_type ?? null,
        notes: body?.notes ?? null,
        ocr_text: body?.ocr_text ?? null,
        idempotency_key: body?.idempotency_key ? String(body.idempotency_key) : null,
      };

      const options = payload.idempotency_key ? { onConflict: "idempotency_key" } : undefined;
      const { data, error } = await client.from("accounting_invoices").upsert(payload, options).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }

    if (action === "list_invoices") {
      const f = body?.filters || {};
      let query = client.from("accounting_invoices").select("*").order("date", { ascending: false }).limit(500);
      if (f.type) query = query.eq("type", String(f.type));
      if (f.status) query = query.eq("status", String(f.status));
      if (f.category) query = query.eq("category", Number(f.category));
      if (f.date_from) query = query.gte("date", String(f.date_from));
      if (f.date_to) query = query.lte("date", String(f.date_to));
      if (f.search) query = query.ilike("vendor_or_client", `%${String(f.search)}%`);

      const { data, error } = await query;
      if (error) throw error;
      return json({ action, items: data || [] });
    }


    if (action === "delete_invoices") {
      const invoiceIds = Array.isArray(body?.invoice_ids) ? body.invoice_ids.map((id: unknown) => String(id).trim()).filter(Boolean) : [];
      if (!invoiceIds.length) return json({ action, deleted: 0 });

      const { data: invoices, error: invoiceErr } = await client
        .from("accounting_invoices")
        .select("id, file_path")
        .in("id", invoiceIds);
      if (invoiceErr) throw invoiceErr;

      for (const invoice of invoices || []) {
        if (invoice?.file_path) {
          const { error: removeError } = await client.storage.from(BUCKET).remove([String(invoice.file_path)]);
          if (removeError) {
            const msg = String(removeError.message || "").toLowerCase();
            if (!msg.includes("not found")) throw removeError;
          }
        }
      }

      const { error: deleteErr, count } = await client
        .from("accounting_invoices")
        .delete({ count: "exact" })
        .in("id", invoiceIds);
      if (deleteErr) throw deleteErr;

      return json({ action, deleted: Number(count || 0) });
    }

    if (action === "create_worker") {
      const payload = {
        id: body?.id || crypto.randomUUID(),
        name: String(body?.name || "").trim(),
        day_rate: parseNumber(body?.day_rate),
        vat_applicable: Boolean(body?.vat_applicable),
        active: body?.active === undefined ? true : Boolean(body?.active),
      };
      const { data, error } = await client.from("accounting_workers").insert(payload).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }

    if (action === "upsert_worker") {
      const payload = {
        id: body?.id || crypto.randomUUID(),
        name: String(body?.name || "").trim(),
        pay_type: String(body?.pay_type || "day") === "month" ? "month" : "day",
        day_rate: parseNumber(body?.day_rate),
        month_rate: parseNumber(body?.month_rate),
        ss_day: parseNumber(body?.ss_day),
        ss_month: parseNumber(body?.ss_month),
        other_day: parseNumber(body?.other_day),
        other_month: parseNumber(body?.other_month),
        notes: body?.notes ?? null,
        active: body?.active === undefined ? true : Boolean(body?.active),
      };
      const { data, error } = await client.from("accounting_workers").upsert(payload, { onConflict: "id" }).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }

    if (action === "list_workers") {
      let query = client.from("accounting_workers").select("*").order("name", { ascending: true }).limit(500);
      if (body?.active !== undefined) query = query.eq("active", Boolean(body.active));
      const { data, error } = await query;
      if (error) throw error;
      return json({ action, items: data || [] });
    }

    if (action === "update_worker") {
      const workerId = String(body?.id || "").trim();
      if (!workerId) throw new Error("Worker id is required");
      const updates: Record<string, unknown> = {};
      if (body?.name !== undefined) updates.name = String(body.name).trim();
      if (body?.day_rate !== undefined) updates.day_rate = parseNumber(body.day_rate);
      if (body?.vat_applicable !== undefined) updates.vat_applicable = Boolean(body.vat_applicable);
      if (body?.active !== undefined) updates.active = Boolean(body.active);

      const { data, error } = await client.from("accounting_workers").update(updates).eq("id", workerId).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }

    if (action === "create_timesheet") {
      const days = Array.isArray(body?.days) ? body.days : [];
      if (!days.length) throw new Error("Timesheet days are required");
      const rows = days.map((entry: Record<string, unknown>) => {
        const hours = parseNumber(entry.hours, 8);
        const dayRate = parseNumber(entry.day_rate, parseNumber(body?.day_rate));
        return {
          worker_id: String(entry.worker_id || body?.worker_id || ""),
          date: String(entry.date || ""),
          hours,
          day_rate: dayRate,
          total_cost: Number(((dayRate / 8) * hours).toFixed(2)),
          status: String(body?.status || "pending"),
          notes: body?.notes ?? null,
        };
      }).filter((row) => row.worker_id && row.date);

      if (!rows.length) throw new Error("No valid timesheet rows");
      const { data, error } = await client.from("accounting_timesheets").insert(rows).select("*");
      if (error) throw error;
      return json({ action, items: data || [] });
    }

    if (action === "upsert_timesheet") {
      const worker_id = String(body?.worker_id || "").trim();
      const work_date = String(body?.work_date || body?.date || "").trim();
      const present = body?.present === undefined ? true : Boolean(body.present);
      if (!worker_id || !work_date) throw new Error("worker_id and work_date are required");

      const payload = {
        worker_id,
        work_date,
        date: work_date,
        present,
        hours: present ? 8 : 0,
        day_rate: parseNumber(body?.day_rate),
        total_cost: 0,
        status: "pending",
      };
      const { data, error } = await client.from("accounting_timesheets").upsert(payload, { onConflict: "worker_id,work_date" }).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }

    if (action === "list_timesheets") {
      const f = body?.filters || {};
      let query = client.from("accounting_timesheets").select("*, accounting_workers(name)").order("date", { ascending: false }).limit(1000);
      if (f.date_from) query = query.gte("date", String(f.date_from));
      if (f.date_to) query = query.lte("date", String(f.date_to));
      if (f.worker_id) query = query.eq("worker_id", String(f.worker_id));
      const { data, error } = await query;
      if (error) throw error;
      return json({ action, items: data || [] });
    }

    if (action === "list_timesheets_range") {
      const from = String(body?.from || "").trim();
      const to = String(body?.to || "").trim();
      if (!from || !to) throw new Error("from and to are required");
      const { data, error } = await client
        .from("accounting_timesheets")
        .select("worker_id, work_date, present")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return json({ action, items: data || [] });
    }

    if (action === "timesheets_summary") {
      const from = String(body?.from || "").trim();
      const to = String(body?.to || "").trim();
      if (!from || !to) throw new Error("from and to are required");
      const { data, error } = await client
        .from("accounting_timesheets")
        .select("worker_id, work_date, present")
        .gte("work_date", from)
        .lte("work_date", to)
        .eq("present", true);
      if (error) throw error;
      return json({ action, items: data || [] });
    }

    if (action === "get_upload_url") {
      const filename = String(body?.filename || "invoice.bin");
      const contentType = String(body?.contentType || "application/octet-stream");
      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const ext = cleanName(filename.includes(".") ? filename.split(".").pop() || "bin" : "bin");
      const objectPath = `accounting/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

      const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(objectPath);
      if (error) throw error;
      return json({ action, bucket: BUCKET, path: objectPath, uploadUrl: data.signedUrl, token: data.token, contentType });
    }

    if (action === "confirm_upload") {
      const invoiceId = String(body?.invoice_id || "").trim();
      const filePath = String(body?.file_path || "").trim();
      if (!invoiceId || !filePath) throw new Error("invoice_id and file_path are required");
      const updates: Record<string, unknown> = { file_path: filePath };
      if (body?.file_name !== undefined) updates.file_name = body.file_name ?? null;
      if (body?.file_type !== undefined) updates.file_type = body.file_type ?? null;
      const { data, error } = await client.from("accounting_invoices").update(updates).eq("id", invoiceId).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }


    if (action === "get_download_url") {
      const invoiceId = String(body?.invoice_id || "").trim();
      if (!invoiceId) throw new Error("invoice_id is required");
      const { data: invoice, error: invoiceError } = await client
        .from("accounting_invoices")
        .select("id, file_path, file_name")
        .eq("id", invoiceId)
        .single();
      if (invoiceError) throw invoiceError;
      if (!invoice?.file_path) return json({ action, signedUrl: null, filename: null });
      const { data: signed, error: signedError } = await client.storage.from(BUCKET).createSignedUrl(String(invoice.file_path), 60 * 10);
      if (signedError) throw signedError;
      return json({ action, signedUrl: signed?.signedUrl || null, filename: invoice.file_name || null });
    }

    if (action === "get_download_urls") {
      const invoiceIds = Array.isArray(body?.invoice_ids) ? body.invoice_ids.map((id: unknown) => String(id).trim()).filter(Boolean) : [];
      if (!invoiceIds.length) return json({ action, items: {} });
      const { data: invoices, error: invoicesError } = await client
        .from("accounting_invoices")
        .select("id, file_path, file_name")
        .in("id", invoiceIds);
      if (invoicesError) throw invoicesError;
      const out: Record<string, { signedUrl: string | null; filename: string | null }> = {};
      for (const invoice of invoices || []) {
        if (!invoice?.file_path) {
          out[String(invoice.id)] = { signedUrl: null, filename: invoice?.file_name || null };
          continue;
        }
        const { data: signed } = await client.storage.from(BUCKET).createSignedUrl(String(invoice.file_path), 60 * 10);
        out[String(invoice.id)] = { signedUrl: signed?.signedUrl || null, filename: invoice?.file_name || null };
      }
      return json({ action, items: out });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    const message = String((error as Error).message || "Internal server error");
    const status = message === "editor PIN required" ? 403 : 400;
    return json({ error: message }, status);
  }
});
