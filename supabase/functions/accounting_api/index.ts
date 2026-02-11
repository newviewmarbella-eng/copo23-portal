import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
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
    const body = await req.json();
    const action = String(body?.action || "").trim();
    const pin = String(body?.pin || "").trim();

    const client = getAdminClient();
    await requireEditorPin(client, pin);

    if (action === "upload-url") {
      const filename = String(body?.filename || "invoice.bin");
      const contentType = String(body?.contentType || "application/octet-stream");
      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const ext = cleanName(filename.includes(".") ? filename.split(".").pop() || "bin" : "bin");
      const objectPath = `accounting/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

      const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(objectPath);
      if (error) throw error;

      return json({
        action,
        bucket: BUCKET,
        path: objectPath,
        uploadUrl: data.signedUrl,
        token: data.token,
        contentType,
      });
    }

    if (action === "save-invoice") {
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
        notes: body?.notes ?? null,
      };

      const { data, error } = await client.from("accounting_invoices").upsert(payload).select("*").single();
      if (error) throw error;
      return json({ action, item: data });
    }

    if (action === "list") {
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

    if (action === "download-url") {
      const path = String(body?.path || "").trim();
      if (!path) throw new Error("Missing path");
      const expiresIn = parseNumber(body?.expiresIn, 3600);
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, expiresIn);
      if (error) throw error;
      return json({ action, signedUrl: data.signedUrl, expiresIn, path, bucket: BUCKET });
    }

    if (action === "export-pdf") {
      const f = body?.filters || {};
      let query = client.from("accounting_invoices").select("*").order("date", { ascending: true }).limit(2000);
      if (f.type) query = query.eq("type", String(f.type));
      if (f.category) query = query.eq("category", Number(f.category));
      if (f.date_from) query = query.gte("date", String(f.date_from));
      if (f.date_to) query = query.lte("date", String(f.date_to));

      const { data: rows, error } = await query;
      if (error) throw error;

      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      let page = pdf.addPage([595, 842]);
      let y = 810;
      page.drawText("Accounting export", { x: 40, y, size: 16, font, color: rgb(0, 0, 0) });
      y -= 24;
      page.drawText("Date | Vendor/Client | Subtotal | VAT | Total | Category", { x: 40, y, size: 10, font });
      y -= 14;

      for (const row of rows || []) {
        if (y < 60) {
          page = pdf.addPage([595, 842]);
          y = 810;
        }
        const line = `${row.date || ""} | ${(row.vendor_or_client || "").slice(0, 20)} | ${row.subtotal || 0} | ${row.vat || 0} | ${row.total || 0} | ${row.category || ""}`;
        page.drawText(line, { x: 40, y, size: 9, font });
        y -= 12;
      }

      const bytes = await pdf.save();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const objectPath = `exports/${stamp}_${f.type || "all"}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(objectPath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } = await client.storage.from(BUCKET).createSignedUrl(objectPath, 3600);
      if (signedError) throw signedError;

      return json({ action, path: objectPath, count: rows?.length || 0, signedUrl: signedData.signedUrl, bucket: BUCKET });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
