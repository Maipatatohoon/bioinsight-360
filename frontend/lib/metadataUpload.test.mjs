import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMetadataRows,
  buildMetadataTemplate,
  chooseComparisonGroups,
  detectMetadataColumns,
  metadataSampleKey,
  suggestGroupsFromSampleNames,
} from './metadataUpload.js';

const assignments = (samples) => samples.map((Sample) => ({ Sample, Group: 'Unassigned' }));

test('detects common sample and group headers', () => {
  assert.deepEqual(detectMetadataColumns(['Sample', 'Condition']), {
    sampleHeader: 'Sample',
    groupHeader: 'Condition',
    headers: ['Sample', 'Condition'],
  });
  assert.equal(detectMetadataColumns(['sample_id', 'treatment']).sampleHeader, 'sample_id');
  assert.equal(detectMetadataColumns(['Run', 'Group']).groupHeader, 'Group');
});

test('detects headers with spaces and avoids a leading cell-type column', () => {
  const columns = detectMetadataColumns(['Cell Type', 'Sample Name', 'Condition']);
  assert.equal(columns.sampleHeader, 'Sample Name');
  assert.equal(columns.groupHeader, 'Condition');
});

test('prefers condition over a generic type column', () => {
  const columns = detectMetadataColumns(['Type', 'Condition', 'Sample']);
  assert.equal(columns.sampleHeader, 'Sample');
  assert.equal(columns.groupHeader, 'Condition');
});

test('normalises common sequencing filename suffixes for fallback matching', () => {
  assert.equal(metadataSampleKey(' SRR123.bam '), 'srr123');
  assert.equal(metadataSampleKey('SRR123.fastq.gz'), 'srr123');
  assert.equal(metadataSampleKey('/data/SRR123.tsv'), 'srr123');
});

test('applies metadata to the matching count samples', () => {
  const rows = assignments(['SRR1', 'SRR2', 'SRR3', 'SRR4']);
  const result = applyMetadataRows(rows, [
    { Sample: 'SRR1', Group: 'Control' },
    { Sample: 'SRR2', Group: 'Control' },
    { Sample: 'SRR3', Group: 'PCOS' },
    { Sample: 'SRR4', Group: 'PCOS' },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.matched, 4);
  assert.deepEqual(result.groupCounts, { Control: 2, PCOS: 2 });
  assert.deepEqual(result.groups.sort(), ['Control', 'PCOS']);
  assert.deepEqual(result.assignments.map((row) => row.Group), [
    'Control',
    'Control',
    'PCOS',
    'PCOS',
  ]);
});

test('matches metadata sample IDs with different case and file suffixes', () => {
  const result = applyMetadataRows(assignments(['SRR123', 'SRR124']), [
    { sample_id: 'srr123.bam', condition: 'Control' },
    { sample_id: 'SRR124.fastq.gz', condition: 'Treated' },
  ]);

  assert.equal(result.matched, 2);
  assert.deepEqual(result.assignments.map((row) => row.Group), ['Control', 'Treated']);
});

test('excludes count samples absent from a partial metadata file', () => {
  const result = applyMetadataRows(assignments(['SRR1', 'SRR2', 'SRR3']), [
    { Sample: 'SRR1', Group: 'Control' },
    { Sample: 'SRR2', Group: 'PCOS' },
  ]);

  assert.equal(result.matched, 2);
  assert.equal(result.assignments[2].Group, 'Exclude');
  assert.deepEqual(result.unmatchedCountSamples, ['SRR3']);
});

test('reports metadata IDs that are not in the count matrix', () => {
  const result = applyMetadataRows(assignments(['SRR1']), [
    { Sample: 'SRR1', Group: 'Control' },
    { Sample: 'SRR9', Group: 'PCOS' },
  ]);

  assert.equal(result.matched, 1);
  assert.deepEqual(result.metadataOnlySamples, ['SRR9']);
});

test('rejects a file with no matching sample IDs instead of clearing assignments', () => {
  const rows = assignments(['SRR1', 'SRR2']);
  const result = applyMetadataRows(rows, [
    { Sample: 'OTHER1', Group: 'Control' },
    { Sample: 'OTHER2', Group: 'PCOS' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.matched, 0);
  assert.match(result.error, /No metadata sample IDs matched/);
  assert.deepEqual(result.assignments.map((row) => row.Group), ['Exclude', 'Exclude']);
});

test('chooses PCOS as the treated group and Control as the control group', () => {
  assert.deepEqual(chooseComparisonGroups(['PCOS', 'Control']), {
    control: 'Control',
    treated: 'PCOS',
  });
  assert.deepEqual(chooseComparisonGroups(['Cumulus_Control', 'Cumulus_PCOS']), {
    control: 'Cumulus_Control',
    treated: 'Cumulus_PCOS',
  });
});

test('builds a reusable template with the real sample IDs', () => {
  const csv = buildMetadataTemplate([
    { Sample: 'SRR1', Group: 'Control' },
    { Sample: 'SRR2', Group: 'Exclude' },
  ]);
  assert.equal(csv, 'Sample,Group\nSRR1,Control\nSRR2,Unassigned\n');
});

test('suggests groups from repeated condition labels in sample names', () => {
  const result = suggestGroupsFromSampleNames([
    'Control_1',
    'Control_2',
    'PCOS_1',
    'PCOS_2',
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.groups, ['Control', 'PCOS']);
  assert.equal(result.control, 'Control');
  assert.equal(result.treated, 'PCOS');
  assert.deepEqual(result.assignments.map((row) => row.Group), [
    'Control',
    'Control',
    'PCOS',
    'PCOS',
  ]);
});

test('prefers the condition label over an earlier cell-type label', () => {
  const result = suggestGroupsFromSampleNames([
    'Cumulus_Control_1',
    'Cumulus_Control_2',
    'Cumulus_PCOS_1',
    'Cumulus_PCOS_2',
    'Oocyte_Control_1',
    'Oocyte_Control_2',
    'Oocyte_PCOS_1',
    'Oocyte_PCOS_2',
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.groups, ['Control', 'PCOS']);
  assert.equal(result.assignments[4].Group, 'Control');
});

test('does not invent groups for accession-only sample names', () => {
  const result = suggestGroupsFromSampleNames([
    'SRR12358979',
    'SRR12358980',
    'SRR12358981',
    'SRR12358982',
  ]);

  assert.equal(result.ok, false);
  assert.match(result.error, /No repeated group labels/);
});
