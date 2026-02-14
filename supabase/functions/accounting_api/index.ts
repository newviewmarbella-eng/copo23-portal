import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { cleanName, corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

const BUCKET = "copo23-invoices";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const ALLOWED_CATEGORIES = new Set([
  "labor",
  "materials",
  "tools",
  "machinery_rental",
  "transport_fuel",
  "services",
  "permits_fees",
  "accommodation_food",
  "other",
]);

function parseNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

function sanitizeShortConcept(value: unknown) {
  return String(value || "").trim().slice(0, 80);
}

function normalizeWarnings(input: unknown[]) {
  const out: string[] = [];
  for (const item of input || []) {
    const text = String(item || "").trim();
    if (text) out.push(text);
  }
  return Array.from(new Set(out));
}

async function callGeminiJson(geminiKey: string, contents: unknown[]) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini error: ${await response.text()}`);
  }
  const payload = await response.json();
  const textCandidate = String(
    payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("\n") || "",
  );
  if (!textCandidate) throw new Error("Gemini returned empty response");
  return JSON.parse(extractJsonText(textCandidate));
}

function asIsoDate(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const exact = text.match(/^\d{4}-\d{2}-\d{2}$/);
  if (exact) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function sanitizeCategory(value: unknown) {
  const category = String(value || "").trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(category) ? category : "other";
}

function inferMainCategory(lines: Array<{ category: string }>) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line.category, (counts.get(line.category) || 0) + 1);
  }
  let winner = "other";
  let max = 0;
  for (const [category, count] of counts.entries()) {
    if (count > max) {
      winner = category;
      max = count;
    }
  }
  return winner;
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
        ocr_status: body?.ocr_status ? String(body.ocr_status) : "pending",
        review_status: body?.review_status ? String(body.review_status) : "needs_review",
        warnings: Array.isArray(body?.warnings) ? body.warnings : [],
        concept: body?.concept ?? null,
        ai_status: body?.ai_status ? String(body.ai_status) : null,
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
      if (f.search) query = query.or(`vendor_or_client.ilike.%${String(f.search)}%,counterparty_name.ilike.%${String(f.search)}%,vendor_name.ilike.%${String(f.search)}%`);

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
      const updates: Record<string, unknown> = {
        id: invoiceId,
        type: String(body?.type || "expense"),
        vendor_or_client: String(body?.vendor_or_client || ""),
        date: String(body?.date || new Date().toISOString().slice(0, 10)),
        subtotal: parseNumber(body?.subtotal, 0),
        vat: parseNumber(body?.vat, 0),
        total: parseNumber(body?.total, 0),
        status: String(body?.status || "pending"),
        ai_status: String(body?.ai_status || "pending"),
        ocr_status: String(body?.ocr_status || "pending"),
        review_status: "needs_review",
        file_path: filePath,
      };
      if (body?.file_name !== undefined) updates.file_name = body.file_name ?? null;
      if (body?.file_type !== undefined) updates.file_type = body.file_type ?? null;
      const { data, error } = await client
        .from("accounting_invoices")
        .upsert(updates, { onConflict: "id" })
        .select("*")
        .single();
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

    if (action === "get_invoice_detail") {
      const invoiceId = String(body?.invoice_id || "").trim();
      if (!invoiceId) throw new Error("invoice_id is required");

      const { data: invoice, error: invoiceError } = await client
        .from("accounting_invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (invoiceError) throw invoiceError;

      const { data: lineItems, error: lineError } = await client
        .from("accounting_invoice_line_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      if (lineError) throw lineError;

      return json({ action, item: invoice, line_items: lineItems || [] });
    }

    if (action === "extract_invoice_ai") {
      const invoiceId = String(body?.invoice_id || "").trim();
      if (!invoiceId) throw new Error("invoice_id is required");

      const { data: invoice, error: invoiceError } = await client
        .from("accounting_invoices")
        .select("id, type, file_path, file_type, file_name")
        .eq("id", invoiceId)
        .single();
      if (invoiceError) throw invoiceError;
      if (!invoice?.file_path) throw new Error("La factura no tiene archivo adjunto (file_path)");

      await client
        .from("accounting_invoices")
        .update({ ai_status: "processing", ai_provider: "gemini", ai_model: GEMINI_MODEL, ocr_status: "processing" })
        .eq("id", invoiceId);

      const { data: fileBlob, error: fileError } = await client.storage.from(BUCKET).download(String(invoice.file_path));
      if (fileError) throw fileError;

      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      const base64Data = toBase64(bytes);
      const mimeType = String(invoice.file_type || "").startsWith("image/") || String(invoice.file_type || "").includes("pdf")
        ? String(invoice.file_type || "application/pdf")
        : (String(invoice.file_name || "").toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

      const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
      if (!geminiKey) throw new Error("Missing GEMINI_API_KEY");

      try {
        const ocrStep = await callGeminiJson(geminiKey, [{
          role: "user",
          parts: [
            {
              text: `Eres un OCR para facturas de España. Devuelve SOLO JSON válido con este schema exacto:
{
  "ocr_text": "texto completo extraído en plano"
}
No añadas markdown ni texto fuera del JSON.`,
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        }]);

        const ocrText = normalizeWarnings([ocrStep?.ocr_text]).join("
");

        const structured = await callGeminiJson(geminiKey, [{
          role: "user",
          parts: [
            {
              text: `Transforma el OCR de una factura en JSON ESTRICTO para contabilidad en España.
Devuelve SOLO JSON válido con este schema exacto:
{
  "counterparty_name": "",
  "counterparty_nif": "",
  "invoice_number": "",
  "document_date": "YYYY-MM-DD",
  "currency": "EUR",
  "base_imponible": 0.00,
  "iva_amount": 0.00,
  "total": 0.00,
  "vat_breakdown": [{"percent": 21, "base": 0.00, "vat": 0.00}],
  "lines": [{"description":"", "qty":1, "unit_price":0.00, "total":0.00, "vat_percent":21}],
  "concept": "texto corto max 80 chars",
  "category": "",
  "subcategory": "",
  "warnings": [""]
}
Reglas:
- NO inventar datos. Si falta, usa null o "" y añade warning missing_x.
- invoice_number debe mantenerse como string literal.
- Importes como números con punto decimal.
- Si hay varios IVAs, rellena vat_breakdown y añade warning multi_vat.
- Responde únicamente con JSON parseable.
OCR:
${ocrText}`,
            },
          ],
        }]);

        const baseImponible = parseNullableNumber(structured?.base_imponible);
        const ivaAmount = parseNullableNumber(structured?.iva_amount);
        const total = parseNullableNumber(structured?.total);
        const vatBreakdown = Array.isArray(structured?.vat_breakdown)
          ? structured.vat_breakdown.map((row: Record<string, unknown>) => ({
            percent: parseNullableNumber(row?.percent),
            base: parseNullableNumber(row?.base),
            vat: parseNullableNumber(row?.vat),
          }))
          : [];

        const normalizedLines = (Array.isArray(structured?.lines) ? structured.lines : [])
          .map((line: Record<string, unknown>) => ({
            invoice_id: invoiceId,
            description: String(line?.description || "").trim() || null,
            qty: parseNullableNumber(line?.qty),
            unit_price: parseNullableNumber(line?.unit_price),
            line_total: parseNullableNumber(line?.total),
            vat_rate: parseNullableNumber(line?.vat_percent),
            category: sanitizeCategory(structured?.category),
            tags: [],
            raw: line,
          }));

        const warnings = normalizeWarnings(Array.isArray(structured?.warnings) ? structured.warnings : []);
        if (vatBreakdown.length > 1 && !warnings.includes("multi_vat")) warnings.push("multi_vat");

        if (
          baseImponible !== null
          && ivaAmount !== null
          && total !== null
          && Math.abs((baseImponible + ivaAmount) - total) > Math.max(0.02, Math.abs(total) * 0.01)
        ) {
          warnings.push("totals_mismatch");
        }

        const reviewStatus = warnings.includes("totals_mismatch") ? "needs_review" : "ok";
        const aiStatus = reviewStatus === "needs_review" ? "needs_review" : "ready";

        const invoiceUpdates: Record<string, unknown> = {
          ai_status: aiStatus,
          ai_provider: "gemini",
          ai_model: GEMINI_MODEL,
          ai_extracted_json: structured,
          ai_warnings: warnings,
          ai_processed_at: new Date().toISOString(),
          ocr_text: ocrText || null,
          ocr_status: "done",
          review_status: reviewStatus,
          warnings,
          processed_at: new Date().toISOString(),
          counterparty_name: String(structured?.counterparty_name || "").trim() || null,
          counterparty_nif: String(structured?.counterparty_nif || "").trim() || null,
          vendor_name: String(structured?.counterparty_name || "").trim() || null,
          vendor_tax_id: String(structured?.counterparty_nif || "").trim() || null,
          invoice_number: String(structured?.invoice_number || "").trim() || null,
          document_date: asIsoDate(structured?.document_date),
          issue_date: asIsoDate(structured?.document_date),
          date: asIsoDate(structured?.document_date),
          currency: String(structured?.currency || "EUR").trim().toUpperCase() || "EUR",
          base_imponible: baseImponible,
          subtotal: baseImponible,
          iva_amount: ivaAmount,
          vat_total: ivaAmount,
          total,
          vat_breakdown_json: vatBreakdown,
          vat_breakdown: vatBreakdown,
          concept: sanitizeShortConcept(structured?.concept) || null,
          category_main: String(structured?.category || "").trim() || null,
          category: parseNullableNumber(structured?.category),
          subcategory: String(structured?.subcategory || "").trim() || null,
        };

        const { error: invoiceUpdateError } = await client
          .from("accounting_invoices")
          .update(invoiceUpdates)
          .eq("id", invoiceId);
        if (invoiceUpdateError) throw invoiceUpdateError;

        const { error: deleteLinesError } = await client
          .from("accounting_invoice_line_items")
          .delete()
          .eq("invoice_id", invoiceId);
        if (deleteLinesError) throw deleteLinesError;

        if (normalizedLines.length) {
          const { error: insertLinesError } = await client
            .from("accounting_invoice_line_items")
            .insert(normalizedLines);
          if (insertLinesError) throw insertLinesError;
        }

        return json({ ok: true, invoice_id: invoiceId, ai_status: aiStatus, review_status: reviewStatus });
      } catch (err) {
        const msg = String((err as Error)?.message || "AI processing error").slice(0, 500);
        await client
          .from("accounting_invoices")
          .update({
            ai_status: "error",
            ocr_status: "error",
            review_status: "needs_review",
            ai_warnings: [msg],
            warnings: [msg],
            ai_processed_at: new Date().toISOString(),
            processed_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);
        throw err;
      }
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    const message = String((error as Error).message || "Internal server error");
    const status = message === "editor PIN required" ? 403 : 400;
    return json({ error: message }, status);
  }
});
