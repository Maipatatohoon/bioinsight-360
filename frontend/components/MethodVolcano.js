'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  classifyMethodRow,
  rowLog2fc,
  rowPadj,
  ENGINE_LABELS,
} from '../lib/methodResults';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const MAX_NON_SIGNIFICANT = 3000;

export default function MethodVolcano({
  rows = [],
  engine = 'deseq2',
  padjThreshold = 0.05,
  fcThreshold = 1.0,
  onGeneSelect,
}) {
  const { traces, significant, plotted } = useMemo(() => {
    const buckets = { up: [], down: [], not_significant: [] };
    for (const row of rows) {
      const log2fc = rowLog2fc(row);
      const metric = rowPadj(row);
      if (log2fc === null || metric === null) continue;
      const category = classifyMethodRow(row, { padjThreshold, fcThreshold });
      buckets[category].push({ row, log2fc, metric });
    }

    // Keep every significant gene; thin the dense non-significant cloud so a
    // 42k-gene table does not freeze the browser. Values are never altered.
    const nonSig = buckets.not_significant;
    const stride = Math.max(1, Math.ceil(nonSig.length / MAX_NON_SIGNIFICANT));
    const sampled = nonSig.filter((_, index) => index % stride === 0);

    const spec = [
      { key: 'up', name: 'Upregulated', color: '#dc2626' },
      { key: 'down', name: 'Downregulated', color: '#2563eb' },
      { key: 'not_significant', name: 'Not significant', color: '#94a3b8' },
    ].map((group) => {
      const data = group.key === 'not_significant' ? sampled : buckets[group.key];
      return {
        x: data.map((d) => d.log2fc),
        y: data.map((d) => -Math.log10(Math.max(d.metric, 1e-300))),
        text: data.map((d) => {
          const gene = d.row?.Gene ?? d.row?.gene ?? '';
          return `Gene: ${gene}<br>log2FC: ${d.log2fc.toFixed(3)}<br>FDR: ${d.metric.toExponential(2)}`;
        }),
        customdata: data.map((d) => d.row?.Gene ?? d.row?.gene),
        mode: 'markers',
        type: 'scatter',
        name: `${group.name} (${data.length}${group.key === 'not_significant' && stride > 1 ? ` of ${nonSig.length}` : ''})`,
        marker: { color: group.color, size: group.key === 'not_significant' ? 4 : 7, opacity: group.key === 'not_significant' ? 0.45 : 0.85 },
        hoverinfo: 'text',
      };
    });
    return {
      traces: spec,
      significant: buckets.up.length + buckets.down.length,
      plotted: spec.reduce((sum, trace) => sum + trace.x.length, 0),
    };
  }, [rows, padjThreshold, fcThreshold]);

  if (!rows.length) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No {ENGINE_LABELS[engine] || engine} results to plot.</div>;
  }
  if (!plotted) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No finite log2 fold-change / adjusted p-values to plot.</div>;
  }

  return (
    <div style={{ width: '100%', height: '460px' }}>
      <Plot
        data={traces}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { title: 'log2 fold change', zerolinecolor: '#475569', gridcolor: '#f1f5f9' },
          yaxis: { title: '-log10(adjusted p-value)', zerolinecolor: '#475569', gridcolor: '#f1f5f9' },
          shapes: [
            { type: 'line', x0: fcThreshold, x1: fcThreshold, y0: 0, y1: 1, yref: 'paper', line: { color: '#475569', dash: 'dash' } },
            { type: 'line', x0: -fcThreshold, x1: -fcThreshold, y0: 0, y1: 1, yref: 'paper', line: { color: '#475569', dash: 'dash' } },
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: -Math.log10(padjThreshold), y1: -Math.log10(padjThreshold), line: { color: '#475569', dash: 'dash' } },
          ],
          margin: { l: 60, r: 20, t: 20, b: 55 },
          legend: { orientation: 'h', y: -0.22 },
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        onClick={(event) => {
          const gene = event?.points?.[0]?.customdata;
          if (gene && onGeneSelect) onGeneSelect(gene);
        }}
      />
      <p style={{ margin: '-0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
        {significant} significant gene(s) at FDR ≤ {padjThreshold} and |log2FC| ≥ {fcThreshold}. Showing {plotted} points.
        {plotted < rows.length && ` ${(rows.length - plotted).toLocaleString()} row(s) lack a finite adjusted p-value or log2FC and are not plotted.`}
      </p>
    </div>
  );
}
