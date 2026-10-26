'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function PCAScatter({ pcaData }) {
  if (!pcaData || !pcaData.pc1 || !pcaData.pc2) {
    return <div className="p-4 text-center text-slate-500">No data available for PCA Scatter.</div>;
  }

  const { pc1, pc2, sampleNames = [], sampleGroups = [], varianceExplained = [0, 0] } = pcaData;

  // Colour by the real metadata group labels. The old binary Control/Treated
  // split mislabelled WT/KO, vehicle/drug and other designs.
  const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#0891b2', '#84cc16'];
  const labels = sampleGroups.map((group) => {
    const text = String(group ?? '').trim();
    return text || 'Unknown';
  });
  const groupOrder = Array.from(new Set(labels));
  const traces = groupOrder.map((group, groupIndex) => {
    const indices = labels.map((label, index) => (label === group ? index : -1)).filter((index) => index !== -1);
    return {
      x: indices.map((index) => pc1[index]),
      y: indices.map((index) => pc2[index]),
      text: indices.map((index) => sampleNames[index] || ''),
      mode: 'markers+text',
      type: 'scatter',
      name: group,
      marker: { color: palette[groupIndex % palette.length], size: 10 },
      textposition: 'top center',
      hovertemplate: '%{text}<br>PC1: %{x:.3f}<br>PC2: %{y:.3f}<extra></extra>',
    };
  });

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
