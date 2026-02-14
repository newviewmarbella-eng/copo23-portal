export const CLIENT_NAME_PATTERNS = ["JESUS MORENO", "JESÚS MORENO", "NEW VIEW MARBELLA", "NVM"];

export const CATEGORY_LABELS: Record<number, string> = {
  1: "Materiales",
  2: "Mano de obra",
  3: "Subcontrata",
  4: "Alquiler",
  5: "Otros",
};

export type Party = { name?: string | null; nif?: string | null; address?: string | null };

export function round2(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: unknown): string {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

export function partyLooksLikeClient(party: Party | null | undefined): boolean {
  const name = normalizeText(party?.name);
  return CLIENT_NAME_PATTERNS.some((pattern) => name.includes(normalizeText(pattern)));
}

export function maybeSwapSupplierCustomer(supplier: Party, customer: Party) {
  const supplierIsClient = partyLooksLikeClient(supplier);
  const customerIsClient = partyLooksLikeClient(customer);
  if (supplierIsClient && !customerIsClient) {
    return { supplier: customer, customer: supplier, swapped: true };
  }
  return { supplier, customer, swapped: false };
}

export function normalizeCategory(category: unknown): number {
  const n = Number(category);
  if ([1, 2, 3, 4, 5].includes(n)) return n;
  return 5;
}

export function normalizeCategoryLabel(category: number, label: unknown): string {
  const fallback = CATEGORY_LABELS[category] || CATEGORY_LABELS[5];
  const text = String(label || "").trim();
  return text || fallback;
}

export type LineLike = { qty?: unknown; unit_price?: unknown; line_total?: unknown; vat_percent?: unknown };
export type VatLike = { base?: unknown; vat?: unknown; total?: unknown; rate?: unknown; percent?: unknown };

export function normalizeTotals(input: {
  lines: LineLike[];
  vatBreakdown: VatLike[];
  subtotal?: unknown;
  vatTotal?: unknown;
  total?: unknown;
}) {
  const lineSubtotal = round2(
    (input.lines || []).reduce((acc, line) => {
      const explicit = Number(line?.line_total);
      if (Number.isFinite(explicit)) return acc + explicit;
      const qty = Number(line?.qty);
      const unit = Number(line?.unit_price);
      return acc + ((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0));
    }, 0),
  );

  let subtotal = Number(input.subtotal);
  if (!Number.isFinite(subtotal) || subtotal === 0) subtotal = lineSubtotal;

  let vatTotal = Number(input.vatTotal);
  if (!Number.isFinite(vatTotal)) vatTotal = NaN;

  if (!Number.isFinite(vatTotal)) {
    const fromBreakdown = round2((input.vatBreakdown || []).reduce((acc, row) => acc + (Number(row?.vat) || 0), 0));
    if (fromBreakdown > 0) vatTotal = fromBreakdown;
  }

  if (!Number.isFinite(vatTotal)) {
    vatTotal = round2((input.lines || []).reduce((acc, line) => {
      const base = Number(line?.line_total);
      const rate = Number(line?.vat_percent);
      if (!Number.isFinite(base) || !Number.isFinite(rate)) return acc;
      return acc + (base * rate) / 100;
    }, 0));
  }

  let total = Number(input.total);
  const recomputed = round2(subtotal + vatTotal);
  if (!Number.isFinite(total)) total = recomputed;

  const mismatch = Math.abs(round2(subtotal + vatTotal - total)) > 0.02;
  if (mismatch) total = recomputed;

  return {
    subtotal: round2(subtotal),
    vatTotal: round2(vatTotal),
    total: round2(total),
    consistent: !mismatch,
  };
}

export function criticalWarnings(input: string[], filePath: string | null | undefined) {
  const warnings = new Set<string>();
  const source = new Set((input || []).map((v) => String(v || "").trim()).filter(Boolean));
  if (source.has("missing_total")) warnings.add("missing_total");
  if (source.has("missing_issue_date") || source.has("missing_document_date")) warnings.add("missing_issue_date");
  if (!filePath || !String(filePath).trim()) warnings.add("missing_file_path");
  return Array.from(warnings);
}
