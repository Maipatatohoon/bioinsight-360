'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function UpSetPlot({ consensusResults = [] }) {
  if (!consensusResults || consensusResults.length === 0) {
    return <div className="p-4 text-center text-slate-500">No data available for UpSet Plot.</div>;
  }

  const overlapSizes = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
  consensusResults.forEach(g => {
    if (g.consensusScore > 0 && overlapSizes[g.consensusScore] !== undefined) {
      overlapSizes[g.consensusScore]++;
    }
  });

  // Old calculation removed

  const sortedKeys = Object.keys(overlapSizes).map(Number).sort((a, b) => a - b);
  const xData = sortedKeys.map(k => `${k} Pipeline${k>1?'s':''}`);
  const yData = sortedKeys.map(k => overlapSizes[k]);

  const colors = ['#1e293b', '#3b82f6', '#0284c7', '#d97706', '#f97316', '#059669'];

  return (
    <div className="w-full h-full min-h-[300px]">
      <Plot
        data={[{
          x: xData,
          y: yData,
          type: 'bar',
          marker: { color: colors.slice(0, Math.max(...sortedKeys)) },
          text: yData.map(String),
          textposition: 'auto',
        }]}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { title: 'Degree of Consensus', gridcolor: '#f1f5f9' },
          yaxis: { title: 'Number of DEGs', gridcolor: '#f1f5f9' },
          margin: { l: 50, r: 20, t: 30, b: 50 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
