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
