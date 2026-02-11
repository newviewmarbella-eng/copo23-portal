import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const client = getAdminClient();
    await requireEditorPin(client, String(body?.pin || ""));
    const f = body?.filters || {};

    let query = client.from("accounting_invoices").select("*").order("date", { ascending: true }).limit(1000);
    if (f.type) query = query.eq("type", f.type);
    if (f.category) query = query.eq("category", Number(f.category));
    if (f.date_from) query = query.gte("date", f.date_from);
    if (f.date_to) query = query.lte("date", f.date_to);
    const { data: rows, error } = await query;
    if (error) throw error;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595, 842]);
    let y = 810;
    page.drawText("Accounting export", { x: 40, y, size: 16, font, color: rgb(0, 0, 0) });
    y -= 24;
    page.drawText("Fecha | Proveedor/Cliente | Base | IVA | Total | Categoria", { x: 40, y, size: 10, font });
    y -= 14;

    for (const r of rows || []) {
      if (y < 60) {
        page = pdf.addPage([595, 842]);
        y = 810;
      }
      const line = `${r.date || ""} | ${(r.vendor_or_client || "").slice(0, 20)} | ${r.subtotal || 0} | ${r.vat || 0} | ${r.total || 0} | ${r.category || ""}`;
      page.drawText(line, { x: 40, y, size: 9, font });
      y -= 12;
    }

    // Annex placeholders for files
    for (const r of rows || []) {
      if (!r.file_path) continue;
      const p = pdf.addPage([595, 842]);
      p.drawText(`Anexo: ${r.file_path}`, { x: 40, y: 810, size: 12, font });
      p.drawText("(MVP) Archivo referenciado en storage.", { x: 40, y: 790, size: 10, font });
    }

    const bytes = await pdf.save();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `accounting_exports/${stamp}_${f.type || "all"}.pdf`;
    const { error: upErr } = await client.storage.from("portal").upload(name, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;
    const { data: signed, error: signedErr } = await client.storage.from("portal").createSignedUrl(name, 60 * 60);
    if (signedErr) throw signedErr;

    return json({ path: name, signedUrl: signed.signedUrl, count: rows?.length || 0 });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
