// Pure helpers for the individual DESeq2/edgeR result views.
// Keeping these out of components makes the statistical rendering testable.

export const CORE_ENGINES = ['deseq2', 'edger'];
export const ENGINE_LABELS = {
  deseq2: 'DESeq2',
  edger: 'edgeR',
  limma: 'limma-voom',
};

const number = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const rowLog2fc = (row) => number(row?.log2FoldChange ?? row?.logFC ?? row?.log2fc);

export const rowPvalue = (row) => number(row?.pvalue ?? row?.PValue ?? row?.['P.Value'] ?? row?.pval);

export const rowPadj = (row) => number(row?.padj ?? row?.FDR ?? row?.['adj.P.Val'] ?? row?.qvalue);

export const rowExpression = (row) => number(row?.baseMean ?? row?.logCPM ?? row?.AveExpr);

export const rowStatistic = (row) => number(row?.stat ?? row?.F ?? row?.t);

/** Significance uses adjusted p-values when available (BH FDR). */
export function classifyMethodRow(row, { padjThreshold = 0.05, fcThreshold = 1.0 } = {}) {
  const log2fc = rowLog2fc(row);
  // Use the adjusted p-value only. A raw p-value fallback would silently
  // bypass multiple-testing correction for genes whose padj is NA.
  const metric = rowPadj(row);
  if (log2fc === null || metric === null) return 'not_significant';
  if (metric > padjThreshold || Math.abs(log2fc) < fcThreshold) return 'not_significant';
  if (log2fc === 0) return 'not_significant';
  return log2fc > 0 ? 'up' : 'down';
}

export function summarizeMethod(rows = [], thresholds = {}) {
  let up = 0;
  let down = 0;
  let tested = 0;
  for (const row of rows) {
    if (rowPadj(row) !== null || rowPvalue(row) !== null) tested += 1;
    const call = classifyMethodRow(row, thresholds);
    if (call === 'up') up += 1;
    else if (call === 'down') down += 1;
  }
  return { total: rows.length, tested, up, down, significant: up + down };
}

export function filterMethodRows(rows = [], { search = '', significance = 'all', thresholds = {} } = {}) {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    const gene = String(row?.Gene ?? row?.gene ?? row?.Gene_ID ?? '').toLowerCase();
    if (needle && !gene.includes(needle)) return false;
    if (significance === 'all') return true;
    return classifyMethodRow(row, thresholds) === significance;
  });
}

export function sortMethodRows(rows = [], { key = 'padj', direction = 'asc' } = {}) {
  const value = (row) => {
    if (key === 'gene') return String(row?.Gene ?? row?.gene ?? '');
    if (key === 'log2fc') return rowLog2fc(row) ?? -Infinity;
    if (key === 'padj') return rowPadj(row) ?? Infinity;
    if (key === 'pvalue') return rowPvalue(row) ?? Infinity;
    if (key === 'expression') return rowExpression(row) ?? -Infinity;
    return 0;
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (typeof av === 'string' || typeof bv === 'string') {
      return direction === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    }
    if (av === bv) return 0;
    return direction === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
  });
}

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function rowsToCsv(rows = []) {
  if (!rows.length) return '';
  const headers = [];
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => csvCell(row?.[key])).join(','));
  }
  return lines.join('\n');
}

export function comparisonRowsToCsv(rows = []) {
  return rowsToCsv(rows);
}

/** A small, deterministic title for the downloadable table. */
export function methodFilename(engine, jobId) {
  const short = String(jobId || 'job').slice(0, 8);
  return `BioInsight360_${ENGINE_LABELS[engine] || engine}_${short}.csv`;
}
