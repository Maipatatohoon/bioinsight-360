'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function PCAScatter({ pcaData }) {
  if (!pcaData || !pcaData.pc1 || !pcaData.pc2) {
    return <div className="p-4 text-center text-slate-500">No data available for PCA Scatter.</div>;
  }

  const { pc1, pc2, sampleNames = [], sampleGroups = [], varianceExplained = [0, 0] } = pcaData;

  const controlIndices = sampleGroups.map((g, i) => (g || '').toLowerCase().includes('control') ? i : -1).filter(i => i !== -1);
  const treatedIndices = sampleGroups.map((g, i) => (g || '').toLowerCase().includes('control') ? -1 : i).filter(i => i !== -1);

  const traces = [
    {
      x: controlIndices.map(i => pc1[i]),
      y: controlIndices.map(i => pc2[i]),
      text: controlIndices.map(i => sampleNames[i]),
      mode: 'markers+text',
      type: 'scatter',
      name: 'Control',
      marker: { color: '#3b82f6', size: 10 },
      textposition: 'top center'
    },
    {
      x: treatedIndices.map(i => pc1[i]),
      y: treatedIndices.map(i => pc2[i]),
      text: treatedIndices.map(i => sampleNames[i]),
      mode: 'markers+text',
      type: 'scatter',
      name: 'Treated',
      marker: { color: '#ef4444', size: 10 },
      textposition: 'top center'
    }
  ];

  return (
    <div className="w-full h-full min-h-[400px]">
      <Plot
        data={traces}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { title: `PC1 (${varianceExplained[0]?.toFixed(1) || 0}%)`, zerolinecolor: '#334155', gridcolor: '#f1f5f9' },
          yaxis: { title: `PC2 (${varianceExplained[1]?.toFixed(1) || 0}%)`, zerolinecolor: '#334155', gridcolor: '#f1f5f9' },
          margin: { l: 50, r: 20, t: 30, b: 50 },
          legend: { orientation: 'h', y: -0.2 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
