import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGeoMetadata,
  parseGeoSeriesMatrix,
  parseGeoSoft,
  groupFromTitle,
  looksLikeGeoSeriesMatrix,
  looksLikeGeoSoft,
} from './geoMetadata.js';

const seriesMatrix = [
  '!Series_title\t"Example"',
  '!Series_geo_accession\t"GSE000001"',
  '!Sample_title\t"oocyte-Control_1"\t"oocyte-Control_2"\t"oocyte-PCOS_1"\t"oocyte-PCOS_2"',
  '!Sample_geo_accession\t"GSM1"\t"GSM2"\t"GSM3"\t"GSM4"',
  '!Sample_source_name_ch1\t"oocyte"\t"oocyte"\t"oocyte"\t"oocyte"',
  '!Sample_characteristics_ch1\t"Sex: female"\t"Sex: female"\t"Sex: female"\t"Sex: female"',
  '!series_matrix_table_begin',
  '"ID_REF"\t"GSM1"\t"GSM2"\t"GSM3"\t"GSM4"',
  '"1"\t"10"\t"11"\t"12"\t"13"',
  '!series_matrix_table_end',
].join('\n');

const withCharacteristics = [
  '!Series_geo_accession\t"GSE000002"',
  '!Sample_title\t"S1"\t"S2"\t"S3"\t"S4"',
  '!Sample_geo_accession\t"GSM1"\t"GSM2"\t"GSM3"\t"GSM4"',
  '!Sample_characteristics_ch1\t"group: Control"\t"group: Control"\t"group: PCOS"\t"group: PCOS"',
].join('\n');

const soft = [
  '^SERIES = GSE000003',
  '!Series_title = "Example"',
  '^SAMPLE = GSM11',
  '!Sample_title = "liver-Control_1"',
  '!Sample_source_name_ch1 = "liver"',
  '!Sample_characteristics_ch1 = "group: Control"',
  '',
  '^SAMPLE = GSM12',
  '!Sample_title = "liver-Control_2"',
  '!Sample_source_name_ch1 = "liver"',
  '!Sample_characteristics_ch1 = "group: Control"',
  '',
  '^SAMPLE = GSM13',
  '!Sample_title = "liver-PCOS_1"',
  '!Sample_source_name_ch1 = "liver"',
  '!Sample_characteristics_ch1 = "group: PCOS"',
  '',
  '^SAMPLE = GSM14',
  '!Sample_title = "liver-PCOS_2"',
  '!Sample_source_name_ch1 = "liver"',
  '!Sample_characteristics_ch1 = "group: PCOS"',
].join('\n');

test('recognises GEO series matrix and SOFT files', () => {
  assert.equal(looksLikeGeoSeriesMatrix(seriesMatrix), true);
  assert.equal(looksLikeGeoSoft(seriesMatrix), false);
  assert.equal(looksLikeGeoSoft(soft), true);
  assert.equal(looksLikeGeoSeriesMatrix('Sample,Group\nS1,Control\n'), false);
});

test('reads groups from GEO series matrix sample titles', () => {
  const result = parseGeoSeriesMatrix(seriesMatrix);
  assert.equal(result.ok, true);
  assert.deepEqual(result.samples, ['GSM1', 'GSM2', 'GSM3', 'GSM4']);
  assert.deepEqual(result.groupCounts, { Control: 2, PCOS: 2 });
  assert.equal(result.rows[0].Tissue, 'oocyte');
});

test('prefers a group characteristic over the sample title', () => {
  const result = parseGeoMetadata(withCharacteristics);
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].Group, 'Control');
  assert.equal(result.rows[2].Group, 'PCOS');
  assert.match(result.rows[0].GroupSource, /characteristic/);
});

test('reads a SOFT family record into Sample/Group rows', () => {
  const result = parseGeoSoft(soft);
  assert.equal(result.ok, true);
  assert.deepEqual(result.samples, ['GSM11', 'GSM12', 'GSM13', 'GSM14']);
  assert.deepEqual(result.groupCounts, { Control: 2, PCOS: 2 });
  assert.equal(result.rows[2].Title, 'liver-PCOS_1');
});

test('never invents a group from an accession-only title', () => {
  assert.equal(groupFromTitle('GSM4705187'), null);
  assert.equal(groupFromTitle('Sample_12'), null);
  assert.equal(groupFromTitle('cumulus granulosa cells-PCOS_3'), 'PCOS');
  assert.equal(groupFromTitle('oocyte-Control_1'), 'Control');
});

test('rejects an ordinary CSV as GEO metadata', () => {
  const result = parseGeoMetadata('Sample,Group\nS1,Control\nS2,PCOS\n');
  assert.equal(result.ok, false);
  assert.match(result.error, /not a GEO/i);
});
