'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

function getMinPvalue(pvalues) {
  if (!pvalues || !Array.isArray(pvalues) || pvalues.length === 0) return 1;
  const valid = pvalues.filter(p => p > 0 && isFinite(p));
  return valid.length > 0 ? Math.min(...valid) : 1;
}

export default function ConsensusVolcano({ consensusResults = [], fcThreshold = 1, pThreshold = 0.05, onGeneSelect }) {
  if (!consensusResults || consensusResults.length === 0) {
    return <div className="p-4 text-center text-slate-500">No data available for Volcano Plot.</div>;
  }

  const traces = [
    { name: 'High Confidence', category: 'high_confidence', color: '#059669' },
    { name: 'Moderate Confidence', category: 'moderate_confidence', color: '#d97706' },
    { name: 'Method-Sensitive', category: 'method_sensitive', color: '#f97316' },
    { name: 'Not Significant', category: 'not_significant', color: '#1e293b' },
  ].map((group) => {
    const data = consensusResults.filter((g) => g.category === group.category);
    return {
      x: data.map((g) => g.log2fc_median),
      y: data.map((g) => -Math.log10(getMinPvalue(g.pvalues))),
      text: data.map((g) => `Gene: ${g.geneName}<br>Score: ${g.consensusScore}<br>Category: ${g.category}<br>Log2FC: ${g.log2fc_median?.toFixed(2)}<br>P-value: ${getMinPvalue(g.pvalues).toExponential(2)}`),
      mode: 'markers',
      type: 'scatter',
      name: group.name,
      marker: { color: group.color, size: 6, opacity: 0.8 },
      hoverinfo: 'text',
      customdata: data.map((g) => g.geneName)
    };
  });

  const pValLog10 = -Math.log10(pThreshold);

  return (
    <div className="w-full h-full min-h-[400px]">
      <Plot
        data={traces}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { title: 'Log2 Fold Change', zerolinecolor: '#334155', gridcolor: '#f1f5f9' },
          yaxis: { title: '-Log10(p-value)', zerolinecolor: '#334155', gridcolor: '#f1f5f9' },
          shapes: [
            { type: 'line', x0: fcThreshold, x1: fcThreshold, y0: 0, y1: 1, yref: 'paper', line: { color: '#1e293b', dash: 'dash' } },
            { type: 'line', x0: -fcThreshold, x1: -fcThreshold, y0: 0, y1: 1, yref: 'paper', line: { color: '#1e293b', dash: 'dash' } },
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: pValLog10, y1: pValLog10, line: { color: '#1e293b', dash: 'dash' } },
          ],
          margin: { l: 50, r: 20, t: 30, b: 50 },
          legend: { orientation: 'h', y: -0.2 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
        onClick={(e) => {
          if (e.points && e.points[0] && onGeneSelect) {
            onGeneSelect(e.points[0].customdata);
          }
        }}
      />
    </div>
  );
}
