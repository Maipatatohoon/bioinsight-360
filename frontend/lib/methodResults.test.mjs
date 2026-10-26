import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMethodRow,
  summarizeMethod,
  filterMethodRows,
  sortMethodRows,
  rowsToCsv,
  methodFilename,
} from './methodResults.js';

const rows = [
  { Gene: 'A', log2FoldChange: 2.1, baseMean: 100, stat: 5, pvalue: 0.001, padj: 0.01 },
  { Gene: 'B', log2FoldChange: -1.8, baseMean: 80, stat: -4, pvalue: 0.002, padj: 0.02 },
  { Gene: 'C', log2FoldChange: 0.4, baseMean: 60, stat: 1, pvalue: 0.2, padj: 0.4 },
  { Gene: 'D', log2FoldChange: 1.5, baseMean: 40, stat: 3, pvalue: 0.01, padj: null },
  { Gene: 'E', log2FoldChange: null, baseMean: 20, stat: null, pvalue: 0.01, padj: 0.03 },
];

test('classifies significant up, down, and not-significant genes', () => {
  assert.equal(classifyMethodRow(rows[0]), 'up');
  assert.equal(classifyMethodRow(rows[1]), 'down');
  assert.equal(classifyMethodRow(rows[2]), 'not_significant');
  assert.equal(classifyMethodRow(rows[3]), 'not_significant'); // padj NA must not fall back to an uncorrected p-value
});

test('a zero fold-change gene is not called up or down even with a permissive threshold', () => {
  assert.equal(
    classifyMethodRow({ Gene: 'Z', log2FoldChange: 0, padj: 0.01 }, { padjThreshold: 0.05, fcThreshold: 0 }),
    'not_significant',
  );
});

test('summarizes counts from the actual rows', () => {
  const summary = summarizeMethod(rows, { padjThreshold: 0.05, fcThreshold: 1.0 });
  assert.equal(summary.total, 5);
  assert.equal(summary.up, 1);
  assert.equal(summary.down, 1);
  assert.equal(summary.significant, 2);
});

test('filters by gene and significance call', () => {
  assert.deepEqual(filterMethodRows(rows, { search: 'a' }).map((row) => row.Gene), ['A']);
  assert.deepEqual(
    filterMethodRows(rows, { significance: 'down', thresholds: { padjThreshold: 0.05, fcThreshold: 1 } }).map((row) => row.Gene),
    ['B'],
  );
});

test('sorts by adjusted p-value with missing values last', () => {
  const sorted = sortMethodRows(rows, { key: 'padj', direction: 'asc' });
  assert.deepEqual(sorted.map((row) => row.Gene), ['A', 'B', 'E', 'C', 'D']);
});

test('CSV export quotes commas and preserves all columns', () => {
  const csv = rowsToCsv([{ Gene: 'A,1', padj: 0.01, note: 'x"y' }]);
  assert.match(csv, /Gene,padj,note/);
  assert.match(csv, /"A,1",0.01,"x""y"/);
});

test('filename uses the method label and short job id', () => {
  assert.equal(methodFilename('edger', 'abcdef123456'), 'BioInsight360_edgeR_abcdef12.csv');
});
