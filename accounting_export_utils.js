(function (global) {
  function formatMoneyES(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return safe.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function csvEscapeSemicolon(value) {
    const text = String(value ?? "");
    if (/[;\n\r"]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function normalizeCategoryLegacy(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (["1", "materiales", "materials"].includes(raw)) return "materiales";
    if (["2", "mano de obra", "mano_obra", "labor", "labour"].includes(raw)) return "mano_obra";
    if (["3", "subcontrata", "subcontract"].includes(raw)) return "subcontrata";
    if (["4", "alquiler", "rent", "rental"].includes(raw)) return "alquiler";
    return "otros";
  }

  const CATEGORY_LABEL_ES = {
    materiales: "Materiales",
    mano_obra: "Mano de obra",
    subcontrata: "Subcontrata",
    alquiler: "Alquiler",
    otros: "Otros",
  };

  function buildManagerInvoiceCsv(items, opts = {}) {
    const headers = [
      "project",
      "doc_type",
      "issue_date",
      "supplier_name",
      "supplier_nif",
      "invoice_number",
      "concept",
      "concept_accounting",
      "category_key",
      "category_label",
      "subcategory_key",
      "subcategory_label",
      "subtotal",
      "vat_total",
      "total",
      "currency",
      "payment_method",
      "status",
      "file_url",
    ];
    const project = opts.project || "Copo 23";
    const rows = [headers.join(";")];

    for (const inv of items || []) {
      const docType = inv?.type || "expense";
      const supplierName = inv?.vendor_name || inv?.counterparty_name || inv?.vendor_or_client || "";
      const supplierNif = inv?.vendor_tax_id || inv?.counterparty_nif || "";
      const categoryKey = normalizeCategoryLegacy(inv?.category);
      const row = [
        project,
        docType,
        inv?.issue_date || inv?.document_date || inv?.date || "",
        supplierName,
        supplierNif,
        inv?.invoice_number || "",
        inv?.concept || "",
        inv?.concept_accounting || "",
        categoryKey,
        CATEGORY_LABEL_ES[categoryKey] || "Otros",
        inv?.subcategory || "otros_otros",
        inv?.subcategory_label || inv?.subcategory || "otros",
        formatMoneyES(inv?.base_imponible ?? inv?.subtotal),
        formatMoneyES(inv?.iva_amount ?? inv?.vat_total ?? inv?.vat),
        formatMoneyES(inv?.total),
        inv?.currency || "EUR",
        inv?.payment_method || "",
        inv?.status || inv?.review_status || "",
        inv?.file_url || "",
      ].map(csvEscapeSemicolon);
      rows.push(row.join(";"));
    }

    return `\uFEFF${rows.join("\n")}`;
  }

  const api = { formatMoneyES, csvEscapeSemicolon, buildManagerInvoiceCsv, normalizeCategoryLegacy };
  global.AccountingCsvUtils = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
