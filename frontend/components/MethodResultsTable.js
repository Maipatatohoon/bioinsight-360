'use client';

import React, { useMemo, useState } from 'react';
import {
  classifyMethodRow,
  filterMethodRows,
  methodFilename,
  rowExpression,
  rowLog2fc,
  rowPadj,
  rowPvalue,
  rowStatistic,
  rowsToCsv,
  sortMethodRows,
  ENGINE_LABELS,
} from '../lib/methodResults';

const PAGE_SIZE = 20;

const fmt = (value, digits = 3) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value !== 0 && Math.abs(value) < 1e-3) return value.toExponential(2);
  return value.toFixed(digits);
};

export default function MethodResultsTable({
  rows = [],
  engine = 'deseq2',
  jobId = '',
  padjThreshold = 0.05,
  fcThreshold = 1.0,
  onGeneSelect,
}) {
  const [search, setSearch] = useState('');
  const [significance, setSignificance] = useState('all');
  const [sort, setSort] = useState({ key: 'padj', direction: 'asc' });
  const [page, setPage] = useState(1);

  const thresholds = { padjThreshold, fcThreshold };
  const filtered = useMemo(() => {
    const subset = filterMethodRows(rows, { search, significance, thresholds });
    return sortMethodRows(subset, sort);
  }, [rows, search, significance, sort, padjThreshold, fcThreshold]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const requestSort = (key) => {
    setSort((previous) => ({
      key,
      direction: previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const download = () => {
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = methodFilename(engine, jobId);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const badge = (row) => {
    const call = classifyMethodRow(row, thresholds);
    const style = call === 'up'
      ? { background: '#fee2e2', color: '#b91c1c' }
      : call === 'down'
        ? { background: '#dbeafe', color: '#1d4ed8' }
        : { background: '#f1f5f9', color: '#64748b' };
    return <span style={{ ...style, padding: '0.15rem 0.45rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>{call === 'up' ? 'UP' : call === 'down' ? 'DOWN' : 'NS'}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search gene…"
          style={{ padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', minWidth: '220px', color: '#0f172a', background: '#fff' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={significance}
            onChange={(event) => { setSignificance(event.target.value); setPage(1); }}
            style={{ padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', background: '#fff' }}
          >
            <option value="all">All genes</option>
            <option value="up">Upregulated only</option>
            <option value="down">Downregulated only</option>
            <option value="not_significant">Not significant</option>
          </select>
          <button onClick={download} style={{ padding: '0.55rem 0.9rem', border: '1px solid #0284c7', borderRadius: '8px', color: '#0369a1', background: '#f0f9ff', fontWeight: 700, cursor: 'pointer' }}>
            Download {ENGINE_LABELS[engine] || engine} CSV (all genes)
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead style={{ background: '#f8fafc', color: '#334155' }}>
            <tr>
              <th style={th} onClick={() => requestSort('gene')}>Gene</th>
              <th style={th}>Call</th>
              <th style={th} onClick={() => requestSort('log2fc')}>log2FC</th>
              <th style={th} onClick={() => requestSort('expression')}>Expression*</th>
              <th style={th}>Statistic</th>
              <th style={th} onClick={() => requestSort('pvalue')}>p-value</th>
              <th style={th} onClick={() => requestSort('padj')}>FDR (adj. p)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const gene = row?.Gene ?? row?.gene ?? row?.Gene_ID ?? `row-${index}`;
              return (
                <tr
                  key={`${gene}-${index}`}
                  onClick={() => onGeneSelect && onGeneSelect(gene)}
                  style={{ borderTop: '1px solid #f1f5f9', cursor: onGeneSelect ? 'pointer' : 'default' }}
                >
                  <td style={td}><strong style={{ color: '#0369a1' }}>{gene}</strong></td>
                  <td style={td}>{badge(row)}</td>
                  <td style={td}>{fmt(rowLog2fc(row))}</td>
                  <td style={td}>{fmt(rowExpression(row), 1)}</td>
                  <td style={td}>{fmt(rowStatistic(row), 2)}</td>
                  <td style={td}>{fmt(rowPvalue(row))}</td>
                  <td style={td}>{fmt(rowPadj(row))}</td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#64748b', padding: '2rem' }}>No genes match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ margin: '0.55rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
        *Expression is method-specific: DESeq2 <code>baseMean</code> (mean normalized count),
        edgeR <code>logCPM</code>, or limma <code>AveExpr</code>. These scales are not directly comparable.
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', color: '#475569', fontSize: '0.85rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>
          Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} matching genes ({rows.length} total)
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} style={pager}>Prev</button>
          <span>Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} style={pager}>Next</button>
        </div>
      </div>
    </div>
  );
}

const th = {
  textAlign: 'left',
  padding: '0.7rem 0.75rem',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const td = { padding: '0.65rem 0.75rem', color: '#1e293b', whiteSpace: 'nowrap' };
const pager = { padding: '0.35rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', color: '#0f172a', cursor: 'pointer' };
