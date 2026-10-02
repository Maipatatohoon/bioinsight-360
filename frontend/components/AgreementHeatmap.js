'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function AgreementHeatmap({ pipelines = [], consensusResults = [], fcThreshold = 1, pThreshold = 0.05, pMetric = 'auto' }) {
  if (!pipelines || pipelines.length === 0 || !consensusResults || consensusResults.length === 0) {
    return <div className="p-4 text-center text-slate-500">No data available for Agreement Heatmap.</div>;
  }

  const topGenes = consensusResults.slice(0, 50);
  const geneNames = topGenes.map(g => g.geneName).reverse();
  const pipelineNames = pipelines.map(p => p.name);
  const isDownstream = pipelines.some(p => p.name === 'DESeq2' || p.name === 'edgeR' || p.name === 'limma');
  const activeMetric = pMetric === 'padj' ? 'padj' : pMetric === 'pvalue' ? 'pvalue' : (isDownstream ? 'padj' : 'pvalue');

  // Build a geneName->index map from consensusResults for fast lookup
  const geneToIndex = new Map();
  consensusResults.forEach((g, idx) => {
    geneToIndex.set(g.geneName, idx);
  });

  const zData = geneNames.map(gene => {
    const gIdx = geneToIndex.get(gene);
    return pipelineNames.map(pipelineName => {
      const pipeline = pipelines.find(p => p.name === pipelineName);
      if (!pipeline || gIdx === undefined) return 0;
      const res = pipeline.results[gIdx];
      const metricVal = res ? (activeMetric === 'pvalue' ? (res.pvalue !== undefined ? res.pvalue : res.padj) : (res.padj !== undefined ? res.padj : res.pvalue)) : 1;
      return (res && metricVal <= pThreshold && Math.abs(res.log2fc) >= fcThreshold) ? 1 : 0;
    });
  });

  const hoverText = geneNames.map(gene => {
    return pipelineNames.map((pipelineName, idx) => {
      const val = zData[geneNames.indexOf(gene)][idx];
      return `Gene: ${gene}<br>Pipeline: ${pipelineName}<br>Status: ${val === 1 ? 'Significant' : 'Not Significant'}`;
    });
  });

  return (
    <div className="w-full h-full min-h-[500px]">
      <Plot
        data={[{
          z: zData,
          x: pipelineNames,
          y: geneNames,
          type: 'heatmap',
          colorscale: [[0, '#f1f5f9'], [1, '#0284c7']],
          showscale: false,
          hoverinfo: 'text',
          text: hoverText,
        }]}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#0f172a' },
          xaxis: { tickangle: 45 },
          yaxis: { automargin: true },
          margin: { l: 100, r: 20, t: 30, b: 100 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
