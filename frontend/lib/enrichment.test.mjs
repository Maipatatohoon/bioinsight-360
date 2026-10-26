import test from 'node:test';
import assert from 'node:assert/strict';
import { computePathwayConsensus } from './enrichment.js';

const term = (id, padj, overlap = 3) => ({
  term: id,
  name: id,
  source: 'GO:BP',
  padj,
  overlap,
  overlappingGenes: ['A', 'B', 'C'],
});

test('pathway categories scale with the number of completed methods', () => {
  const one = [term('GO:1', 0.01), term('GO:2', 0.01)];
  const two = [term('GO:1', 0.01)];
  const result = computePathwayConsensus([one, two], 0.05);
  const byTerm = Object.fromEntries(result.map((row) => [row.term, row]));
  assert.equal(byTerm['GO:1'].category, 'high_confidence');
  assert.equal(byTerm['GO:1'].pipelinesEnriched, '2/2');
  assert.equal(byTerm['GO:2'].category, 'method_sensitive');
  assert.equal(byTerm['GO:2'].pipelinesEnriched, '1/2');
});

test('missing adjusted p-values are skipped rather than replaced with raw p-values', () => {
  const invalid = { ...term('GO:3', undefined), pvalue: 1e-8 };
  const result = computePathwayConsensus([[invalid]], 0.05);
  assert.equal(result.length, 0);
});
