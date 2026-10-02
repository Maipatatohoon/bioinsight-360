'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function JaccardMatrix({ jaccardMatrix, pipelineNames = [] }) {
  if (!jaccardMatrix || !pipelineNames || pipelineNames.length === 0) {
    return <div className="p-4 text-center text-slate-500">No data available for Jaccard Matrix.</div>;
  }
  
  const textData = jaccardMatrix.map(row => row.map(val => val.toFixed(2)));

  return (
    <div className="w-full h-full min-h-[400px]">
      <Plot
        data={[{
          z: jaccardMatrix,
          x: pipelineNames,
          y: pipelineNames,
          type: 'heatmap',
          colorscale: [[0, '#0f172a'], [1, '#0d9488']],
          text: textData,
          texttemplate: "%{text}",
          hoverinfo: 'x+y+z',
        }]}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { tickangle: 45 },
          yaxis: { automargin: true, autorange: 'reversed' },
          margin: { l: 100, r: 20, t: 20, b: 100 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
