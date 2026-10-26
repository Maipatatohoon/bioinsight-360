// Shared, dependency-free helpers for the upload page's metadata CSV flow.
// Keeping these pure makes the sample matching and group selection testable.

const SAMPLE_HEADER_RE = /^(sample|sample_?id|sample_?name|sample_?accession|id|name|run|run_?id|srr|gsm|library|library_?id|library_?name|biosample|subject|subject_?id|individual|donor)$/i;
const GROUP_HEADER_RE = /^(group|group_?name|condition|condition_?name|treatment|treatment_?group|status|phenotype|type|class|category|disease|genotype|arm|cohort)$/i;
const SAMPLE_HEADER_PRIORITY = [
  /^sample_?id$/i,
  /^sample_?name$/i,
  /^sample$/i,
  /^run_?id$/i,
  /^run$/i,
  /^srr$/i,
  /^gsm$/i,
  /^biosample$/i,
  /^library_?id$/i,
  /^library_?name$/i,
  /^library$/i,
  /^subject_?id$/i,
  /^subject$/i,
  /^individual$/i,
  /^donor$/i,
  /^name$/i,
  /^id$/i,
];
const GROUP_HEADER_PRIORITY = [
  /^group_?name$/i,
  /^group$/i,
  /^condition_?name$/i,
  /^condition$/i,
  /^treatment_?group$/i,
  /^treatment$/i,
  /^phenotype$/i,
  /^status$/i,
  /^disease$/i,
  /^genotype$/i,
  /^arm$/i,
  /^cohort$/i,
  /^type$/i,
  /^class$/i,
  /^category$/i,
];

const CONTROL_RE = /control|ctrl|untreated|baseline|vehicle|wt|wild[ _-]?type|normal|healthy|mock|sham/i;
const TREATED_RE = /treated|treatment|case|disease|pcos|ko|knockout|mutant|drug|exposed|infected|tumou?r|cancer/i;
const NON_GROUP_RE = /^(exclude|excluded|unassigned|unknown|na|n\/a|none|)$/i;
const TECHNICAL_TOKEN_RE = /^(rep|replicate|r|s|sample|samp|lane|batch|run|file|count|counts|raw|normalized|norm|f|r1|r2|read|reads)$/i;

function cleanValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

/**
 * Normalise a sample identifier for fallback matching. Exact/case-insensitive
 * matching is attempted first; this is only used when that fails.
 */
export function metadataSampleKey(value) {
  let key = cleanValue(value);
  // Some users export a path or a file name in the metadata sample column.
  key = key.split(/[\\/]/).pop() || key;
  // Accept common sequencing-file suffixes that are not part of the sample ID.
  key = key
    .replace(/\.(gz|bz2|xz)$/i, '')
    .replace(/\.(bam|sam|fastq|fq|fasta|fa|tsv|csv|txt|counts?)$/i, '');
  return key.toLowerCase().replace(/\s+/g, ' ');
}

function headerKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function detectMetadataColumns(headers = []) {
  const cleaned = headers.map((header) => String(header ?? '').trim());
  const keyed = cleaned.map((header) => ({ header, key: headerKey(header) }));

  const findPriority = (priority) => {
    for (const pattern of priority) {
      const match = keyed.find(({ key }) => pattern.test(key));
      if (match) return match.header;
    }
    return null;
  };

  const sampleHeader =
    findPriority(SAMPLE_HEADER_PRIORITY) ||
    keyed.find(({ key }) => SAMPLE_HEADER_RE.test(key))?.header ||
    cleaned[0] ||
    null;
  const groupHeader =
    findPriority(GROUP_HEADER_PRIORITY) ||
    keyed.find(({ key }) => GROUP_HEADER_RE.test(key))?.header ||
    (cleaned.length > 1 ? cleaned[1] : null);
  return { sampleHeader, groupHeader, headers: cleaned };
}

/**
 * Apply a metadata table to the count-matrix assignments.
 *
 * Rules:
 * - Exact sample ID match first, then case/extension-insensitive matching.
 * - Count samples absent from the metadata are marked Exclude.
 * - Metadata rows with no matching count column are reported, not silently lost.
 * - If nothing matches, the caller can reject the file instead of erasing work.
 */
export function applyMetadataRows(assignments = [], rows = []) {
  const headers = Object.keys(rows[0] || {});
  const columns = detectMetadataColumns(headers);

  if (!columns.sampleHeader) {
    return {
      ok: false,
      error: 'The metadata file has no sample column. Use a header such as Sample, SampleID, ID, Run, or GSM.',
      assignments: assignments.map((row) => ({ ...row })),
      matched: 0,
      groups: [],
      groupCounts: {},
      unmatchedCountSamples: [],
      metadataOnlySamples: [],
      duplicateSamples: [],
      columns,
    };
  }
  if (!columns.groupHeader) {
    return {
      ok: false,
      error: 'The metadata file has no group column. Use a header such as Group, Condition, Treatment, or Phenotype.',
      assignments: assignments.map((row) => ({ ...row })),
      matched: 0,
      groups: [],
      groupCounts: {},
      unmatchedCountSamples: [],
      metadataOnlySamples: [],
      duplicateSamples: [],
      columns,
    };
  }

  const exact = new Map();
  const normalised = new Map();
  const metadataSamples = [];
  const duplicates = new Set();

  for (const row of rows) {
    const sample = cleanValue(row[columns.sampleHeader]);
    if (!sample) continue;
    const group = cleanValue(row[columns.groupHeader]) || 'Unassigned';

    if (exact.has(sample)) duplicates.add(sample);
    exact.set(sample, group);

    const key = metadataSampleKey(sample);
    if (normalised.has(key)) duplicates.add(sample);
    normalised.set(key, group);
    metadataSamples.push(sample);
  }

  const unmatchedCountSamples = [];
  const groupCounts = {};
  let matched = 0;

  const updated = assignments.map((row) => {
    const sample = cleanValue(row.Sample || row.sample || row.ID || row.id || row.Name || row.name);
    let group = exact.get(sample);
    if (group === undefined) {
      group = normalised.get(metadataSampleKey(sample));
    }

    if (group === undefined) {
      unmatchedCountSamples.push(sample);
      return { Sample: sample, Group: 'Exclude' };
    }

    matched += 1;
    groupCounts[group] = (groupCounts[group] || 0) + 1;
    return { Sample: sample, Group: group };
  });

  const countSampleKeys = new Set(
    assignments.map((row) =>
      metadataSampleKey(row.Sample || row.sample || row.ID || row.id || row.Name || row.name)
    )
  );
  const metadataOnlySamples = Array.from(
    new Set(
      metadataSamples.filter(
        (sample) =>
          !countSampleKeys.has(metadataSampleKey(sample)) &&
          !assignments.some(
            (row) => cleanValue(row.Sample || row.sample || row.ID || row.id || row.Name || row.name) === sample
          )
      )
    )
  );

  const groups = Object.keys(groupCounts).filter((group) => !NON_GROUP_RE.test(cleanValue(group)));

  return {
    ok: matched > 0,
    error: matched > 0 ? null : 'No metadata sample IDs matched the count-matrix columns.',
    assignments: updated,
    matched,
    groups,
    groupCounts,
    unmatchedCountSamples,
    metadataOnlySamples,
    duplicateSamples: Array.from(duplicates),
    columns,
  };
}

/** Pick sensible defaults, while always leaving the user free to change them. */
export function chooseComparisonGroups(groups = []) {
  const available = groups.filter((group) => !NON_GROUP_RE.test(cleanValue(group)));
  const control =
    available.find((group) => CONTROL_RE.test(group)) ||
    available[0] ||
    null;
  const treated =
    available.find((group) => group !== control && TREATED_RE.test(group)) ||
    available.find((group) => group !== control) ||
    null;
  return { control, treated };
}

function isTechnicalToken(token) {
  return /^\d+$/.test(token) || TECHNICAL_TOKEN_RE.test(token);
}

function sampleTokens(value) {
  const text = cleanValue(value).split(/[\\/]/).pop() || '';
  // Split `Control1` / `SRR123` into `Control 1` / `SRR 123` so the label
  // position can be compared without assuming a particular naming style.
  return text
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * Suggest groups from labels already present in sample names, never from the
 * count values themselves. This is deliberately a suggestion: the caller must
 * show the result and let the user confirm or edit it before submitting.
 *
 * It only succeeds when one token position contains at least two repeated,
 * non-technical labels (for example Control_1 / PCOS_1). SRA/accession-only
 * names, or names with no repeated labels, return ok:false.
 */
export function suggestGroupsFromSampleNames(samples = []) {
  const rows = samples
    .map((sample) => ({ sample: cleanValue(sample), tokens: sampleTokens(sample) }))
    .filter((row) => row.sample);

  if (rows.length < 4) {
    return {
      ok: false,
      error: 'At least four labelled samples are needed to suggest two groups.',
      assignments: [],
      groups: [],
    };
  }

  const maxLength = Math.max(...rows.map((row) => row.tokens.length));
  let best = null;

  for (let position = 0; position < maxLength; position += 1) {
    if (rows.some((row) => !row.tokens[position])) continue;
    const values = rows.map((row) => row.tokens[position]);
    const groups = Array.from(new Set(values));

    if (groups.length < 2 || groups.length > 8) continue;
    if (groups.some((group) => isTechnicalToken(group))) continue;
    if (groups.length === values.length) continue;

    const groupCounts = {};
    values.forEach((group) => {
      groupCounts[group] = (groupCounts[group] || 0) + 1;
    });
    if (Object.values(groupCounts).some((count) => count < 2)) continue;

    const controlLike = groups.some((group) => CONTROL_RE.test(group));
    const treatedLike = groups.some((group) => TREATED_RE.test(group));
    const score =
      (controlLike ? 100 : 0) +
      (treatedLike ? 100 : 0) +
      (groups.length === 2 ? 20 : 0) +
      rows.length * 10 -
      groups.length;

    if (!best || score > best.score) {
      best = { position, groups, groupCounts, score };
    }
  }

  if (!best) {
    return {
      ok: false,
      error: 'No repeated group labels were found in the sample names. Use a metadata CSV for this dataset.',
      assignments: [],
      groups: [],
    };
  }

  const assignments = rows.map((row) => ({
    Sample: row.sample,
    Group: row.tokens[best.position],
  }));
  const defaults = chooseComparisonGroups(best.groups);

  return {
    ok: true,
    assignments,
    groups: best.groups,
    groupCounts: best.groupCounts,
    position: best.position,
    control: defaults.control,
    treated: defaults.treated,
  };
}

/** Generate a metadata sheet for the current count matrix. */
export function buildMetadataTemplate(assignments = []) {
  const esc = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = ['Sample,Group'];
  for (const row of assignments) {
    const sample = cleanValue(row.Sample || row.sample || row.ID || row.id || row.Name || row.name);
    if (!sample) continue;
    const group = cleanValue(row.Group || row.group);
    lines.push(`${esc(sample)},${esc(group && !/^exclude$/i.test(group) ? group : 'Unassigned')}`);
  }
  return `${lines.join('\n')}\n`;
}
