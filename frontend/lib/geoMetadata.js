// Read sample groups from the metadata files biologists actually download from
// GEO: the series matrix (`GSE..._series_matrix.txt.gz`) and the SOFT family
// record (`GSE..._family.soft.gz`). Both are plain text and can be parsed in the
// browser, so the user does not have to hand-build a Sample/Group CSV.
//
// This module is dependency-free so it can be unit-tested without a browser.

const GROUP_KEY_RE = /^(group|group_?name|condition|treatment|disease|disease_?state|diagnosis|phenotype|status|genotype|arm|cohort|subject_?group)s?$/i;
const CONTROL_RE = /control|ctrl|untreated|baseline|vehicle|wt|wild[ _-]?type|normal|healthy|mock|sham/i;
const TREATED_RE = /treated|treatment|case|disease|pcos|ko|knockout|mutant|drug|exposed|infected|tumou?r|cancer/i;
const NON_GROUP_RE = /^(exclude|excluded|unassigned|unknown|na|n\/a|none|not applicable|)$/i;

function unquote(value) {
  return String(value ?? '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .trim();
}

/** A GEO series matrix starts with `!Series_...` lines and a tab-separated table. */
export function looksLikeGeoSeriesMatrix(text = '') {
  const head = String(text).slice(0, 20000);
  return /^\s*!Series_geo_accession\b/m.test(head) || /^\s*!series_matrix_table_begin\b/m.test(head);
}

/** A GEO SOFT family record has one `^SAMPLE = GSM...` block per sample. */
export function looksLikeGeoSoft(text = '') {
  return /^\s*\^SAMPLE\s*=/m.test(String(text).slice(0, 200000));
}

function splitCharacteristics(value) {
  const text = unquote(value);
  const colon = text.indexOf(':');
  if (colon === -1) return { key: '', value: text };
  return {
    key: text.slice(0, colon).trim(),
    value: text.slice(colon + 1).trim(),
  };
}

/**
 * Pull a group label out of a sample title such as
 * `oocyte-Control_1`, `cumulus granulosa cells-PCOS_3`, or `Control_rep1`.
 * Returns null when the title carries no recognisable condition, so callers
 * never invent a group from an accession-only name.
 */
export function groupFromTitle(title) {
  const text = unquote(title);
  if (!text) return null;
  for (const part of text.split(/[|/]/)) {
    const tokens = part.split(/[-_]/).map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      if (/^\d+$/.test(token)) continue;
      if (CONTROL_RE.test(token)) return token;
      if (TREATED_RE.test(token)) return token;
    }
  }
  return null;
}

function tissueFromTitle(title) {
  const text = unquote(title);
  const prefix = text.split(/[-_|/]/)[0]?.trim();
  if (!prefix || /^\d+$/.test(prefix)) return '';
  if (CONTROL_RE.test(prefix) || TREATED_RE.test(prefix)) return '';
  return prefix;
}

/**
 * Choose the characteristics field most likely to describe the experimental
 * group. Keys like `group`, `disease state`, `condition` win over generic ones.
 */
function pickGroupCharacteristic(perSample) {
  const keyCounts = new Map();
  for (const sample of perSample) {
    for (const characteristic of sample.characteristics) {
      if (!characteristic.key || !characteristic.value) continue;
      if (NON_GROUP_RE.test(characteristic.value)) continue;
      const key = characteristic.key.toLowerCase().replace(/\s+/g, ' ');
      if (!keyCounts.has(key)) keyCounts.set(key, new Set());
      keyCounts.get(key).add(characteristic.value);
    }
  }

  const candidates = [...keyCounts.entries()]
    .filter(([, values]) => values.size >= 2 && values.size <= 8)
    .map(([key, values]) => {
      const list = [...values];
      return {
        key,
        values: list,
        score:
          (GROUP_KEY_RE.test(key) ? 100 : 0) +
          (list.length === 2 ? 20 : 0) +
          (list.some((v) => CONTROL_RE.test(v)) ? 20 : 0) +
          (list.some((v) => TREATED_RE.test(v)) ? 20 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.key || null;
}

function buildRows(perSample) {
  const groupKey = pickGroupCharacteristic(perSample);

  const rows = perSample.map((sample) => {
    let group = '';
    if (groupKey) {
      const match = sample.characteristics.find(
        (c) => c.key.toLowerCase().replace(/\s+/g, ' ') === groupKey
      );
      group = match?.value || '';
    }
    let source = groupKey ? `characteristic:${groupKey}` : '';
    if (!group) {
      const fromTitle = groupFromTitle(sample.title);
      if (fromTitle) {
        group = fromTitle;
        source = 'title';
      }
    }
    return {
      Sample: sample.id || sample.title,
      Group: group || 'Unassigned',
      Title: sample.title || '',
      Tissue: sample.source || tissueFromTitle(sample.title),
      GroupSource: source,
    };
  });

  const groups = [...new Set(rows.map((r) => r.Group))].filter(
    (group) => group && !NON_GROUP_RE.test(group)
  );

  return { rows, groups, groupKey };
}

function summarize(rows, groups) {
  const groupCounts = {};
  for (const group of groups) {
    groupCounts[group] = rows.filter((r) => r.Group === group).length;
  }
  return {
    ok: rows.length > 0,
    rows,
    groups,
    groupCounts,
    samples: rows.map((r) => r.Sample),
    error: rows.length ? null : 'No samples were found in this GEO file.',
  };
}

export function parseGeoSeriesMatrix(text = '') {
  const lines = String(text).split(/\r?\n/);
  const fields = new Map();

  for (const line of lines) {
    if (!line.startsWith('!Sample_')) {
      if (line.startsWith('!series_matrix_table_begin')) break;
      continue;
    }
    const parts = line.split('\t');
    const key = parts[0].trim();
    const values = parts.slice(1).map(unquote);
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(values);
  }

  const titles = fields.get('!Sample_title')?.[0] || [];
  const accession = fields.get('!Sample_geo_accession')?.[0] || [];
  const source = fields.get('!Sample_source_name_ch1')?.[0] || [];
  const characteristicRows = fields.get('!Sample_characteristics_ch1') || [];

  const count = Math.max(titles.length, accession.length, source.length);
  if (!count) {
    return { ok: false, rows: [], groups: [], groupCounts: {}, samples: [], error: 'No !Sample_ lines found in the series matrix.' };
  }

  const perSample = [];
  for (let i = 0; i < count; i += 1) {
    perSample.push({
      id: accession[i] || '',
      title: titles[i] || '',
      source: source[i] || '',
      characteristics: characteristicRows
        .map((values) => splitCharacteristics(values[i]))
        .filter((c) => c.key || c.value),
    });
  }

  const built = buildRows(perSample);
  return { ...summarize(built.rows, built.groups), source: 'series-matrix' };
}

export function parseGeoSoft(text = '') {
  const blocks = String(text).split(/^\^SAMPLE\s*=\s*/m).slice(1);
  const perSample = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const id = unquote(lines[0]?.split(/\s+/)[0] || '');
    let title = '';
    let source = '';
    const characteristics = [];

    for (const line of lines) {
      const match = line.match(/^!(Sample_title|Sample_source_name_ch1|Sample_characteristics_ch1)\s*=\s*(.*)$/);
      if (!match) continue;
      const value = unquote(match[2]);
      if (match[1] === 'Sample_title') title = value;
      else if (match[1] === 'Sample_source_name_ch1') source = value;
      else characteristics.push(splitCharacteristics(value));
    }

    if (id || title) {
      perSample.push({ id, title, source, characteristics });
    }
  }

  if (!perSample.length) {
    return { ok: false, rows: [], groups: [], groupCounts: {}, samples: [], error: 'No ^SAMPLE blocks found in the SOFT file.' };
  }

  const built = buildRows(perSample);
  return { ...summarize(built.rows, built.groups), source: 'soft' };
}

/**
 * Parse either GEO metadata format. Returns rows in the same shape as the
 * standard Sample/Group CSV, so the existing matcher can consume them.
 */
export function parseGeoMetadata(text = '') {
  if (looksLikeGeoSeriesMatrix(text)) return parseGeoSeriesMatrix(text);
  if (looksLikeGeoSoft(text)) return parseGeoSoft(text);
  return {
    ok: false,
    rows: [],
    groups: [],
    groupCounts: {},
    samples: [],
    error: 'This file is not a GEO series matrix or SOFT family record.',
  };
}
