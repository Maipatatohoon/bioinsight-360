'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function PathwayChart({ pathwayConsensusResults = [] }) {
  if (!pathwayConsensusResults || pathwayConsensusResults.length === 0) {
    return <div className="p-4 text-center text-slate-500">No data available for Pathway Chart.</div>;
  }

  const sortedData = [...pathwayConsensusResults].sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    return (a.adjPValueMedian ?? 1) - (b.adjPValueMedian ?? 1);
  }).slice(0, 15).reverse();

  const colors = sortedData.map(p => 
    p.category === 'high_confidence' ? '#059669' : 
    p.category === 'moderate_confidence' ? '#d97706' : '#f97316'
  );

  return (
    <div className="w-full h-full min-h-[400px]">
      <Plot
        data={[{
          y: sortedData.map(p => p.name),
          x: sortedData.map(p => -Math.log10(Math.max(p.adjPValueMedian || 1, 1e-300))),
          type: 'bar',
          orientation: 'h',
          marker: { color: colors },
          text: sortedData.map(p => `Score: ${p.consensusScore}`),
          textposition: 'auto',
          hoverinfo: 'y+x+text'
        }]}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { title: '-Log10(Adj. P-value)', gridcolor: '#f1f5f9' },
          yaxis: { automargin: true },
          margin: { l: 200, r: 20, t: 20, b: 50 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
