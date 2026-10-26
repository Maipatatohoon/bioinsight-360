import test from 'node:test';
import assert from 'node:assert/strict';
import { computeConsensus, formatDownstreamPipelines } from './consensus.js';

test('downstream formatting keeps adjusted p-values separate from raw p-values', () => {
  const { pipelines } = formatDownstreamPipelines(
    [{ Gene: 'A', log2FoldChange: 2, pvalue: 0.001, padj: 0.01 }],
    [{ Gene: 'A', log2FoldChange: 2, PValue: 0.002 }],
    null,
  );
  assert.equal(pipelines[0].results[0].padj, 0.01);
  assert.equal(pipelines[0].results[0].pvalue, 0.001);
  assert.ok(Number.isNaN(pipelines[1].results[0].padj));
  assert.equal(pipelines[1].results[0].pvalue, 0.002);
});

test('missing padj never borrows a raw p-value for consensus significance', () => {
  const { pipelines, geneNames } = formatDownstreamPipelines(
    [{ Gene: 'A', log2FoldChange: 2, padj: 0.01 }],
    [{ Gene: 'A', log2FoldChange: 2, pvalue: 0.001 }],
    null,
  );
  const [call] = computeConsensus(pipelines, geneNames, 1, 0.05, 'padj');
  assert.equal(call.consensusScore, 1);
  assert.deepEqual(call.directions, { positive: 1, negative: 0 });
});

test('consensus score counts significant methods, and directions are reported separately', () => {
  const { pipelines, geneNames } = formatDownstreamPipelines(
    [{ Gene: 'A', log2FoldChange: 2, padj: 0.01 }],
    [{ Gene: 'A', log2FoldChange: -2, padj: 0.01 }],
    null,
  );
  const [call] = computeConsensus(pipelines, geneNames, 1, 0.05, 'padj');
  assert.equal(call.consensusScore, 2);
  assert.deepEqual(call.directions, { positive: 1, negative: 1 });
  assert.equal(call.category, 'direction_conflict');
  assert.equal(call.totalPipelines, 2);
});

test('empty method tables are not counted as completed pipelines', () => {
  const { pipelines } = formatDownstreamPipelines(
    [{ Gene: 'A', log2FoldChange: 2, padj: 0.01 }],
    [],
    [],
  );
  assert.equal(pipelines.length, 1);
  assert.equal(pipelines[0].name, 'DESeq2');
});
