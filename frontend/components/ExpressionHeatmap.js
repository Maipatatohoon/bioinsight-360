'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

/**
 * Shared QC heatmap of the most variable genes. Values are log2 CPM row
 * z-scores produced by the backend from the actual input matrix.
 */
export default function ExpressionHeatmap({ heatmap }) {
  if (!heatmap || !heatmap.values?.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        Expression heatmap is not available for this job.
      </div>
    );
  }

  const { genes = [], samples = [], groups = [], values = [], metric = 'log2 CPM, row z-score' } = heatmap;
  const customdata = values.map(() => groups);
  const labels = samples.map((sample, index) => `${sample} (${groups[index] ?? 'group'})`);

  return (
    <div>
      <Plot
        data={[{
          z: values,
          x: labels,
          y: genes,
          type: 'heatmap',
          colorscale: 'RdBu',
          reversescale: true,
          zmin: -3,
          zmax: 3,
          colorbar: { title: 'z-score', thickness: 14 },
          hovertemplate: 'Gene: %{y}<br>Sample: %{x}<br>Value: %{z:.2f}<extra></extra>',
          customdata,
        }]}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a', size: 11 },
          margin: { l: 90, r: 30, t: 20, b: 120 },
          xaxis: { tickangle: -45, automargin: true },
          yaxis: { automargin: true, tickfont: { size: 9 } },
        }}
        useResizeHandler
        style={{ width: '100%', height: '720px' }}
      />
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
        {heatmap.selection || `Top variable genes`} · {metric}. Source: the common input matrix, not an individual DE method.
      </p>
    </div>
  );
}
