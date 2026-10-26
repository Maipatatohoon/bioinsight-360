'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Storage } from '../lib/storage';
import {
  getJobStatus,
  getMethodResults,
  compareMethods,
  getSavedComparison,
} from '../lib/backend_api';
import {
  ENGINE_LABELS,
  comparisonRowsToCsv,
  rowLog2fc,
  rowPadj,
  rowsToCsv,
  summarizeMethod,
} from '../lib/methodResults';
import MethodResultsTable from './MethodResultsTable';
import MethodVolcano from './MethodVolcano';
import ExpressionHeatmap from './ExpressionHeatmap';
import PCAScatter from './PCAScatter';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const METHODS = ['deseq2', 'edger', 'limma'];
const CORE = ['deseq2', 'edger'];
// WORKER_DISCONNECTED is not final: a recovered worker can still upload
// results. Keep polling so those tables appear without a manual refresh.
const TERMINAL = new Set(['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED']);
const PAGE_SIZE = 20;

const METHOD_COPY = {
  deseq2: 'Negative-binomial GLM with empirical Bayes shrinkage (DESeq2).',
  edger: 'Quasi-likelihood negative-binomial GLM (edgeR).',
  limma: 'limma-voom precision-weighted linear model (optional third method).',
};

const stateStyle = (state) => {
  if (state === 'COMPLETED') return { background: '#dcfce7', color: '#15803d' };
  if (state === 'PARTIALLY_COMPLETED') return { background: '#fef3c7', color: '#b45309' };
  if (state === 'FAILED' || state === 'CANCELLED' || state === 'WORKER_DISCONNECTED') return { background: '#fee2e2', color: '#b91c1c' };
  if (state === 'RUNNING' || state === 'GENERATING_RESULTS') return { background: '#dbeafe', color: '#1d4ed8' };
  return { background: '#f1f5f9', color: '#475569' };
};

const fmt = (value, digits = 3) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (number !== 0 && Math.abs(number) < 1e-3) return number.toExponential(2);
  return number.toFixed(digits);
};

function Badge({ children, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.22rem 0.6rem', borderRadius: '999px', fontSize: '0.74rem',
      fontWeight: 800, letterSpacing: '0.02em', ...style,
    }}>
      {children}
    </span>
  );
}

function StatusCard({ engine, method, rows, error, terminal }) {
  const status = method?.status || (rows ? 'completed' : 'pending');
  const notRun = terminal && !rows && status === 'pending';
  const label = status === 'completed' ? 'Completed' : status === 'failed' ? 'Failed' : status === 'running' ? 'Running' : notRun ? 'Not run' : 'Pending';
  return (
    <div className="glass-card" style={{ padding: '0.9rem 1rem', flex: '1 1 180px', minWidth: '170px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
        <strong style={{ color: '#0f172a' }}>{ENGINE_LABELS[engine]}</strong>
        <Badge style={stateStyle(status.toUpperCase())}>{label}</Badge>
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#475569' }}>
        {rows ? `${rows.length.toLocaleString()} genes tested` : method?.error || error || (notRun ? 'Optional method was not requested or did not run.' : 'Waiting for result table…')}
      </div>
    </div>
  );
}

function MethodPanel({ engine, method, rows, error, thresholds, jobId, onGeneSelect }) {
  const summary = useMemo(() => summarizeMethod(rows || [], thresholds), [rows, thresholds]);
  const status = method?.status || (rows ? 'completed' : 'pending');

  return (
    <section className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.45rem' }}>{ENGINE_LABELS[engine]} Results</h2>
          <p style={{ margin: '0.3rem 0 0', color: '#475569', fontSize: '0.9rem' }}>{METHOD_COPY[engine]}</p>
        </div>
        <Badge style={stateStyle(status.toUpperCase())}>{status}</Badge>
      </div>

      {method?.error && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', marginBottom: '1rem' }}>
          <strong>{ENGINE_LABELS[engine]} error:</strong> {method.error}
        </div>
      )}
      {error && !method?.error && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {!rows && status !== 'failed' && error && (
        <div style={{ padding: '1rem 1.1rem', borderRadius: '8px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
          <strong>Could not load the saved {ENGINE_LABELS[engine]} table.</strong>
          <p style={{ margin: '0.4rem 0 0.6rem', fontSize: '0.86rem' }}>{error}</p>
          <button onClick={() => window.location.reload()} style={secondaryButton}>Retry</button>
        </div>
      )}
      {!rows && status !== 'failed' && !error && (
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#475569' }}>
          <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 0.8rem', border: '3px solid #cbd5e1', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          {status === 'running' ? `Running ${ENGINE_LABELS[engine]} on the worker…` : `Waiting for ${ENGINE_LABELS[engine]} to start…`}
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            This page refreshes automatically; other completed methods remain available.
          </p>
        </div>
      )}

      {!rows && status === 'failed' && (
        <p style={{ margin: 0, color: '#991b1b' }}>
          No {ENGINE_LABELS[engine]} table was saved. The other method can still be inspected independently.
        </p>
      )}

      {rows && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <Stat label="Genes tested" value={summary.total.toLocaleString()} color="#0f172a" />
            <Stat label="Significant" value={summary.significant.toLocaleString()} color="#0284c7" />
            <Stat label="Upregulated" value={summary.up.toLocaleString()} color="#dc2626" />
            <Stat label="Downregulated" value={summary.down.toLocaleString()} color="#2563eb" />
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.84rem', color: '#475569' }}>
            Significance rule: adjusted p-value ≤ {thresholds.padj} (BH) and |log2FC| ≥ {thresholds.fc}.
          </p>
          <MethodVolcano
            rows={rows}
            engine={engine}
            padjThreshold={thresholds.padj}
            fcThreshold={thresholds.fc}
            onGeneSelect={onGeneSelect}
          />
          <div style={{ marginTop: '1.5rem' }}>
            <MethodResultsTable
              rows={rows}
              engine={engine}
              jobId={jobId}
              padjThreshold={thresholds.padj}
              fcThreshold={thresholds.fc}
              onGeneSelect={onGeneSelect}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, color = '#0f172a', hint }) {
  return (
    <div style={{ padding: '0.8rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff' }}>
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color, lineHeight: 1.2, marginTop: '0.2rem' }}>{value}</div>
      {hint && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{hint}</div>}
    </div>
  );
}

function PlotsPanel({ status }) {
  const qc = status?.qc_data;
  if (!qc) {
    return (
      <section className="glass-card" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, color: '#0f172a' }}>Plots</h2>
        <p style={{ color: '#475569' }}>QC plots are not available for this job yet.</p>
      </section>
    );
  }
  const pca = qc.pcaResult
    ? {
        pc1: qc.pcaResult.components?.[0] || [],
        pc2: qc.pcaResult.components?.[1] || [],
        sampleNames: qc.sampleNames || [],
        sampleGroups: qc.sampleGroups || [],
        varianceExplained: qc.pcaResult.varianceExplained || [0, 0],
      }
    : null;

  return (
    <section className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0, color: '#0f172a' }}>PCA &amp; Expression Heatmap</h2>
      <p style={{ marginTop: 0, color: '#475569', fontSize: '0.9rem' }}>
        These are shared quality-control views derived from the common input matrix and a
        log2-CPM transformation. They are not separate per-method statistical results.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', color: '#0f172a' }}>PCA</h3>
          <div style={{ height: '360px' }}>
            {pca ? <PCAScatter pcaData={pca} /> : <p style={{ color: '#64748b' }}>PCA is unavailable.</p>}
          </div>
          {pca && (
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Variance explained: PC1 {fmt(pca.varianceExplained[0], 1)}%, PC2 {fmt(pca.varianceExplained[1], 1)}%.
            </p>
          )}
        </div>
        <div>
          <h3 style={{ fontSize: '1.05rem', color: '#0f172a' }}>Sample correlation</h3>
          <div style={{ height: '360px' }}>
            {qc.corrMatrix?.length ? (
              <Plot
                data={[{
                  z: qc.corrMatrix,
                  x: qc.sampleNames,
                  y: qc.sampleNames,
                  type: 'heatmap',
                  colorscale: 'Blues',
                  zmin: Math.max(0, Math.min(...qc.corrMatrix.flat()) - 0.05),
                  zmax: 1,
                }]}
                layout={{
                  autosize: true,
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { color: '#0f172a' },
                  margin: { l: 80, r: 20, t: 20, b: 90 },
                  xaxis: { tickangle: -45 },
                }}
                useResizeHandler
                style={{ width: '100%', height: '100%' }}
              />
            ) : <p style={{ color: '#64748b' }}>Correlation matrix is unavailable.</p>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', color: '#0f172a' }}>Top variable genes</h3>
        <ExpressionHeatmap heatmap={qc.expressionHeatmap} />
      </div>
    </section>
  );
}

function ComparisonTable({ comparison }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const all = comparison?.rows || [];
    const needle = search.trim().toLowerCase();
    return all.filter((row) => {
      if (needle && !String(row.gene).toLowerCase().includes(needle)) return false;
      if (filter === 'consensus') return row.consensus;
      if (filter === 'deseq2_only') return row.deseq2_significant && !row.edger_significant;
      if (filter === 'edger_only') return row.edger_significant && !row.deseq2_significant;
      if (filter === 'disagree') return row.direction_agreement === 'disagree';
      return true;
    });
  }, [comparison, filter, search]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const download = () => {
    const csv = comparisonRowsToCsv(comparison?.rows || []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BioInsight360_DESeq2_vs_edgeR_${comparison?.job_id?.slice(0, 8) || 'comparison'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search gene…"
          style={inputStyle}
        />
        <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} style={inputStyle}>
          <option value="all">All compared genes</option>
          <option value="consensus">Consensus only</option>
          <option value="deseq2_only">DESeq2-only</option>
          <option value="edger_only">edgeR-only</option>
          <option value="disagree">Direction disagreement</option>
        </select>
        <button onClick={download} style={secondaryButton}>Download comparison CSV</button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead style={{ background: '#f8fafc', color: '#334155' }}>
            <tr>
              {['Gene', 'DESeq2 log2FC', 'DESeq2 FDR', 'edgeR log2FC', 'edgeR FDR', 'Direction', 'Consensus'].map((label) => (
                <th key={label} style={thStyle}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.gene} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={tdStyle}><strong style={{ color: '#0369a1' }}>{row.gene}</strong></td>
                <td style={tdStyle}>{fmt(row.deseq2_log2fc)}</td>
                <td style={tdStyle}>{fmt(row.deseq2_padj)}</td>
                <td style={tdStyle}>{fmt(row.edger_log2fc)}</td>
                <td style={tdStyle}>{fmt(row.edger_padj)}</td>
                <td style={tdStyle}>{row.direction_agreement === 'agree' ? 'Agree' : row.direction_agreement === 'disagree' ? 'Disagree' : row.direction_agreement === 'one_method' ? 'One method' : 'Not significant'}</td>
                <td style={tdStyle}>{row.consensus ? <Badge style={stateStyle('COMPLETED')}>Consensus</Badge> : '—'}</td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', padding: '2rem' }}>No genes match this comparison filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.84rem', color: '#475569' }}>
        <span>Showing {visible.length} of {rows.length} matching genes ({comparison?.rows?.length || 0} total)</span>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button disabled={current === 1} onClick={() => setPage(current - 1)} style={secondaryButton}>Prev</button>
          <span>Page {current} of {pages}</span>
          <button disabled={current === pages} onClick={() => setPage(current + 1)} style={secondaryButton}>Next</button>
        </div>
      </div>
    </div>
  );
}

function ComparisonPanel({ jobId, methods, results, comparison, setComparison }) {
  const [padj, setPadj] = useState(0.05);
  const [fc, setFc] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ready = CORE.every((engine) => methods?.[engine]?.status === 'completed' && results?.[engine]?.length);
  const missing = CORE.filter((engine) => methods?.[engine]?.status !== 'completed' || !results?.[engine]?.length);

  useEffect(() => {
    const parameters = comparison?.parameters;
    if (!parameters) return;
    if (Number.isFinite(Number(parameters.padj_threshold))) setPadj(Number(parameters.padj_threshold));
    if (Number.isFinite(Number(parameters.log2fc_threshold))) setFc(Number(parameters.log2fc_threshold));
  }, [comparison?.created_at]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await compareMethods(jobId, { padjThreshold: padj, log2fcThreshold: fc });
      setComparison(response.comparison);
    } catch (err) {
      setError(err.message || 'Comparison failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0, color: '#0f172a' }}>Optional: Compare DESeq2 and edgeR</h2>
      <p style={{ color: '#475569', fontSize: '0.92rem' }}>
        This is a separate, user-triggered calculation over the saved DESeq2 and edgeR
        tables. It does not re-run either analysis and it is not required to view the
        individual method results.
      </p>

      {!ready && (
        <div style={{ padding: '0.9rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#475569', marginBottom: '1rem' }}>
          Comparison is enabled when both methods have completed. Missing: {missing.map((engine) => ENGINE_LABELS[engine]).join(', ') || 'result tables'}.
          {missing.some((engine) => methods?.[engine]?.status === 'failed') && ' A failed method cannot be compared; its individual error remains visible above.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>
          Adjusted p-value threshold: {padj}
          <input type="range" min="0.001" max="0.2" step="0.005" value={padj} onChange={(event) => setPadj(Number(event.target.value))} style={{ width: '100%', accentColor: '#0284c7' }} />
        </label>
        <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>
          |log2 fold change| threshold: {fc}
          <input type="range" min="0" max="3" step="0.1" value={fc} onChange={(event) => setFc(Number(event.target.value))} style={{ width: '100%', accentColor: '#0284c7' }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={run} disabled={!ready || busy} className={ready && !busy ? 'btn-primary' : 'btn-disabled'} style={{ padding: '0.65rem 1.2rem', fontWeight: 800, cursor: ready && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Comparing saved results…' : 'Compare DESeq2 and edgeR'}
        </button>
        {!ready && <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Waiting for both result tables.</span>}
      </div>

      {error && <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', marginBottom: '1rem' }}>{error}</div>}

      {comparison && (
        <>
          <div style={{ padding: '0.65rem 0.9rem', borderRadius: '8px', background: '#eff6ff', color: '#1e40af', fontSize: '0.82rem', marginBottom: '1rem' }}>
            Saved comparison from {new Date((comparison.created_at || 0) * 1000).toLocaleString()} · thresholds:
            FDR ≤ {comparison.parameters?.padj_threshold}, |log2FC| ≥ {comparison.parameters?.log2fc_threshold}.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <Stat label="Consensus" value={comparison.summary.consensus.toLocaleString()} color="#15803d" hint={`${comparison.summary.consensus_up} up / ${comparison.summary.consensus_down} down`} />
            <Stat label="Shared significant" value={comparison.summary.shared_significant.toLocaleString()} hint="Both methods" />
            <Stat label="DESeq2 only" value={comparison.summary.deseq2_only.toLocaleString()} color="#b45309" />
            <Stat label="edgeR only" value={comparison.summary.edger_only.toLocaleString()} color="#b45309" />
            <Stat label="Direction agreement" value={comparison.summary.direction_agree.toLocaleString()} color="#0284c7" hint={`${comparison.summary.direction_disagree} disagreement(s)`} />
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: 0 }}>
            Consensus = significant in both methods at the stated thresholds and the same
            direction. Genes significant in only one method remain method-specific.
            Consensus is not a claim of biological truth.
          </p>
          <ComparisonTable comparison={comparison} />
        </>
      )}
    </section>
  );
}

function FunctionalPanel({ anyComplete, router }) {
  return (
    <section className="glass-card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0, color: '#0f172a' }}>Optional: Functional Analysis</h2>
      <p style={{ color: '#475569' }}>
        Functional enrichment is optional and uses the saved result tables. It does not
        block the individual DESeq2/edgeR views or the comparison.
      </p>
      <button
        onClick={() => router.push('/pathways')}
        disabled={!anyComplete}
        className={anyComplete ? 'btn-primary' : 'btn-disabled'}
        style={{ padding: '0.65rem 1.2rem', fontWeight: 800, cursor: anyComplete ? 'pointer' : 'not-allowed' }}
      >
        Open functional analysis →
      </button>
      {!anyComplete && <div style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.85rem' }}>Available after at least one method completes.</div>}
    </section>
  );
}

export default function JobResultsDashboard({ jobId }) {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState({});
  const [methodErrors, setMethodErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const [activeTab, setActiveTab] = useState('deseq2');
  const [thresholds, setThresholds] = useState({ padj: 0.05, fc: 1.0 });
  const [comparison, setComparison] = useState(null);
  const loadedRef = useRef(new Set());
  const comparisonLoadedRef = useRef(false);
  const tabPinnedRef = useRef(false);

  useEffect(() => {
    Storage.setItem('currentJobId', jobId);
    Storage.setItem('analysisMode', 'downstream');
    Storage.setItem('downstreamSource', 'job');
  }, [jobId]);

  useEffect(() => {
    let alive = true;
    let timer = null;

    const load = async () => {
      try {
        const nextStatus = await getJobStatus(jobId);
        if (!alive) return;
        setStatus(nextStatus);
        setConnectionError(null);
        setLoading(false);

        const methods = nextStatus.methods || {};
        const completed = METHODS.filter((engine) => methods[engine]?.status === 'completed');
        await Promise.all(completed.map(async (engine) => {
          if (loadedRef.current.has(engine)) return;
          loadedRef.current.add(engine);
          try {
            const response = await getMethodResults(jobId, engine);
            if (!alive) return;
            setResults((previous) => ({ ...previous, [engine]: response.results || [] }));
            setMethodErrors((previous) => ({ ...previous, [engine]: null }));
          } catch (err) {
            loadedRef.current.delete(engine);
            if (alive) setMethodErrors((previous) => ({ ...previous, [engine]: err.message }));
          }
        }));

        if (!alive) return;
        const coreComplete = CORE.every((engine) => methods[engine]?.status === 'completed');
        if ((coreComplete || TERMINAL.has(nextStatus.state)) && !comparisonLoadedRef.current) {
          comparisonLoadedRef.current = true;
          try {
            const saved = await getSavedComparison(jobId);
            if (alive && saved?.comparison) setComparison(saved.comparison);
          } catch {
            // A missing/unsaved comparison is expected; never block the result view.
          }
        }
        if (!TERMINAL.has(nextStatus.state)) {
          timer = setTimeout(load, 2500);
        }
      } catch (err) {
        if (!alive) return;
        setLoading(false);
        setConnectionError(err.message || 'Could not reach the backend.');
        timer = setTimeout(load, 5000);
      }
    };

    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [jobId]);

  const methods = status?.methods || {};
  const anyComplete = METHODS.some((engine) => methods[engine]?.status === 'completed');

  // If DESeq2 has not produced a table, open whichever method is readable, so a
  // partial job does not look empty. A user-clicked tab is never overridden.
  useEffect(() => {
    if (tabPinnedRef.current) return;
    if (methods.deseq2?.status === 'completed') return;
    if (methods.edger?.status === 'completed') { setActiveTab('edger'); return; }
    if (methods.limma?.status === 'completed') setActiveTab('limma');
  }, [methods.deseq2?.status, methods.edger?.status, methods.limma?.status]);
  const tabs = useMemo(() => {
    const items = [
      { id: 'deseq2', label: 'DESeq2 Results' },
      { id: 'edger', label: 'edgeR Results' },
    ];
    if (methods.limma?.status === 'completed' || results.limma) items.push({ id: 'limma', label: 'limma (optional)' });
    items.push({ id: 'plots', label: 'Plots' });
    items.push({ id: 'comparison', label: 'Optional Comparison' });
    items.push({ id: 'functional', label: 'Optional Functional Analysis' });
    return items;
  }, [methods, results]);

  if (loading && !status) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#0f172a' }}>
        <div className="spinner" style={{ width: '30px', height: '30px', margin: '0 auto 1rem', border: '3px solid #cbd5e1', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        Loading saved analysis results…
      </div>
    );
  }

  if (!status) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b' }}>
          <h2 style={{ marginTop: 0 }}>Could not load this job</h2>
          <p>{connectionError || 'The backend did not return a status for this job.'}</p>
          <button onClick={() => window.location.reload()} style={secondaryButton}>Retry</button>
        </div>
      </div>
    );
  }

  const params = status.params || {};
  const state = status.state || 'QUEUED';
  const progress = status.progress ?? 0;

  return (
    <div style={{ padding: '2rem', minHeight: '100vh', maxWidth: '1400px', margin: '0 auto', color: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <span className="page-eyebrow">Results</span>
          <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>DESeq2 &amp; edgeR Results</h1>
          <p style={{ margin: 0, color: '#475569' }}>
            Job <code style={{ background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{jobId.slice(0, 8)}</code>
            {params.treated_group && params.control_group && (
              <> · contrast: <strong>{params.treated_group} vs {params.control_group}</strong></>
            )}
            {params.design && <> · design <code>{params.design}</code></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge style={stateStyle(state)}>{state}</Badge>
          <button onClick={() => window.location.reload()} style={secondaryButton}>Refresh</button>
          <button onClick={() => router.push('/export')} style={secondaryButton}>Export</button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem', color: '#475569', marginBottom: '0.45rem' }}>
          <span>{status.message || 'Analysis status'}</span>
          <span>{progress}%</span>
        </div>
        <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`, background: state === 'FAILED' ? '#dc2626' : '#0284c7', transition: 'width 0.4s ease' }} />
        </div>
        {state === 'PARTIALLY_COMPLETED' && (
          <p style={{ margin: '0.7rem 0 0', color: '#92400e', fontSize: '0.88rem' }}>
            Only one core method completed. The completed method remains fully accessible;
            the failed method's error is shown in its tab. This is not a successful
            two-method analysis.
          </p>
        )}
        {state === 'FAILED' && (
          <p style={{ margin: '0.7rem 0 0', color: '#991b1b', fontSize: '0.88rem' }}>
            {status.error || 'The analysis failed before producing a result table.'}
          </p>
        )}
        {connectionError && (
          <p style={{ margin: '0.7rem 0 0', color: '#92400e', fontSize: '0.88rem' }}>
            {connectionError} Retrying automatically…
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {METHODS.map((engine) => (
          <StatusCard
            key={engine}
            engine={engine}
            method={methods[engine]}
            rows={results[engine]}
            error={methodErrors[engine]}
            terminal={TERMINAL.has(state)}
          />
        ))}
      </div>

      {status.warnings?.length > 0 && (
        <details className="glass-card" style={{ padding: '0.9rem 1.1rem', marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#92400e' }}>
            {status.warnings.length} analysis warning(s)
          </summary>
          <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem', color: '#475569', fontSize: '0.86rem' }}>
            {status.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      )}

      <div className="glass-card" style={{ padding: '0.4rem', marginBottom: '1.25rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { tabPinnedRef.current = true; setActiveTab(tab.id); }}
            style={{
              padding: '0.6rem 0.9rem', border: 'none', borderRadius: '8px',
              cursor: 'pointer', fontWeight: 800, fontSize: '0.86rem',
              background: activeTab === tab.id ? '#0284c7' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#334155',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', color: '#475569', fontSize: '0.85rem' }}>
        <label>
          FDR threshold: <strong>{thresholds.padj}</strong>
          <input type="range" min="0.001" max="0.2" step="0.005" value={thresholds.padj}
            onChange={(event) => setThresholds((previous) => ({ ...previous, padj: Number(event.target.value) }))}
            style={{ display: 'block', width: '200px', accentColor: '#0284c7' }} />
        </label>
        <label>
          |log2FC| threshold: <strong>{thresholds.fc}</strong>
          <input type="range" min="0" max="3" step="0.1" value={thresholds.fc}
            onChange={(event) => setThresholds((previous) => ({ ...previous, fc: Number(event.target.value) }))}
            style={{ display: 'block', width: '200px', accentColor: '#0284c7' }} />
        </label>
        <span>These thresholds affect table highlighting and the method views; the saved statistics are unchanged. The optional comparison has its own thresholds.</span>
      </div>

      {CORE.includes(activeTab) && (
        <MethodPanel
          engine={activeTab}
          method={methods[activeTab]}
          rows={results[activeTab]}
          error={methodErrors[activeTab]}
          thresholds={thresholds}
          jobId={jobId}
        />
      )}
      {activeTab === 'limma' && (
        <MethodPanel
          engine="limma"
          method={methods.limma}
          rows={results.limma}
          error={methodErrors.limma}
          thresholds={thresholds}
          jobId={jobId}
        />
      )}
      {activeTab === 'plots' && <PlotsPanel status={status} />}
      {activeTab === 'comparison' && (
        <ComparisonPanel
          jobId={jobId}
          methods={methods}
          results={results}
          comparison={comparison}
          setComparison={setComparison}
        />
      )}
      {activeTab === 'functional' && <FunctionalPanel anyComplete={anyComplete} router={router} />}
    </div>
  );
}

const inputStyle = {
  padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: '8px',
  color: '#0f172a', background: '#fff', minWidth: '190px',
};
const secondaryButton = {
  padding: '0.5rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px',
  background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: 700,
};
const thStyle = {
  textAlign: 'left', padding: '0.65rem 0.7rem', fontSize: '0.72rem',
  textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
};
const tdStyle = { padding: '0.6rem 0.7rem', color: '#1e293b', whiteSpace: 'nowrap' };
