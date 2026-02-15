import test from 'node:test';
import assert from 'node:assert/strict';
import utils from '../accounting_export_utils.js';

test('formatMoneyES always uses 2 decimals', () => {
  assert.equal(utils.formatMoneyES(8.7), '8,70');
  assert.match(utils.formatMoneyES(1234), /^1\.?234,00$/);
});

test('csv escape handles semicolons and line breaks', () => {
  const value = 'Concepto; con salto\nlinea';
  assert.equal(utils.csvEscapeSemicolon(value), '"Concepto; con salto\nlinea"');
});

test('buildManagerInvoiceCsv includes professional accounting fields', () => {
  const csv = utils.buildManagerInvoiceCsv([{
    type: 'expense',
    vendor_or_client: 'BigMat',
    invoice_number: 'A-1',
    issue_date: '2026-01-01',
    concept: 'Compra material',
    concept_accounting: 'Copo 23 – Materiales / Ferretería y consumibles: Compra material (BigMat)',
    category: 'materiales',
    subcategory: 'ferreteria_consumibles',
    subcategory_label: 'Ferretería y consumibles',
    subtotal: 100,
    vat_total: 21,
    total: 121,
  }]);
  assert.match(csv, /concept_accounting/);
  assert.match(csv, /category_key/);
  assert.match(csv, /subcategory_key/);
  assert.match(csv, /Materiales/);
  assert.match(csv, /121,00/);
});
