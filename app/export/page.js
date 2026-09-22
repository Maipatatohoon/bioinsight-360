'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { runAllPipelines, computeConsensus, computeFleissKappa, formatDownstreamPipelines } from '../../lib/consensus';
import { computePathwayConsensus } from '../../lib/enrichment';
import { runGProfilerEnrichment } from '../../lib/gprofiler_api';

export default function ExportPage() {
  // Minimal CSV row parser — handles quoted fields
  function parseCSVRow(line) {
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; }
      else if (c === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    result.push(cur.trim());
    return result;
  }
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function computeSummary() {
      try {
        setLoading(true);
        const analysisMode = Storage.getItem('analysisMode') || 'compute';
        let pData, consensus;
        let sampleNames = [];
        let geneNames = [];
        let controlIndices = [];
        let treatedIndices = [];

        if (analysisMode === 'downstream') {
          const deseq2 = JSON.parse(Storage.getItem('deseq2Data'));
          const edger = JSON.parse(Storage.getItem('edgerData'));
          const limma = JSON.parse(Storage.getItem('limmaData'));
          pData = formatDownstreamPipelines(deseq2, edger, limma);
          geneNames = pData.geneNames;
          
          const rawMetaCSV = Storage.getItem('rawMetadata');
          if (rawMetaCSV) {
            const metaLines = rawMetaCSV.trim().split('\n');
            const groupMap = {};
            for (let i = 1; i < metaLines.length; i++) {
              if (!metaLines[i].trim()) continue;
              const [s, g] = parseCSVRow(metaLines[i]);
              groupMap[s] = (g || '').toLowerCase();
              sampleNames.push(s);
            }
            sampleNames.forEach((name, idx) => {
              const group = groupMap[name] || (idx % 2 === 0 ? 'control' : 'treated');
              if (group.includes('control') || group.includes('untreated')) {
                controlIndices.push(idx);
              } else {
                treatedIndices.push(idx);
              }
            });
          }
        } else {
          let rawCountsCSV = Storage.getItem('filteredCounts') || Storage.getItem('rawCounts');
          let rawMetaCSV = Storage.getItem('rawMetadata');

          if (!rawCountsCSV || !rawMetaCSV) {
            const countRes = await fetch('/data/demo_counts.csv');
            rawCountsCSV = await countRes.text();
            const metaRes = await fetch('/data/demo_metadata.csv');
            rawMetaCSV = await metaRes.text();
          }

          const lines = rawCountsCSV.trim().split('\n');
          const header = parseCSVRow(lines[0]);
          sampleNames = header.slice(1);

          const metaLines = rawMetaCSV.trim().split('\n');
          const groupMap = {};
          for (let i = 1; i < metaLines.length; i++) {
            if (!metaLines[i].trim()) continue;
            const [s, g] = parseCSVRow(metaLines[i]);
            groupMap[s] = (g || '').toLowerCase();
          }

          const activeControlGroup = Storage.getItem('activeControlGroup') || 'Control';
          const activeTreatedGroup = Storage.getItem('activeTreatedGroup') || 'Treated';

          sampleNames.forEach((name, idx) => {
            const group = groupMap[name] || (idx % 2 === 0 ? 'control' : 'treated');
            if (group.toLowerCase() === activeControlGroup.toLowerCase() || group.includes('control') || group.includes('untreated')) {
              controlIndices.push(idx);
            } else {
              treatedIndices.push(idx);
            }
          });

          const cachedData = Storage.getItem('pipelineData');
          if (cachedData) {
            try {
              pData = JSON.parse(cachedData);
            } catch(e) {
              console.error('Failed to parse cached pipeline data', e);
            }
          }
          if (!pData) {
            throw new Error("No cached pipeline data found. Please run the consensus analysis first.");
          }
          geneNames = pData.geneNames;
        }

        // Read thresholds set by user on Consensus page
        const userFc = parseFloat(Storage.getItem('consensusFcThreshold') || '1.0');
        const userPval = parseFloat(Storage.getItem('consensusPvalThreshold') || '0.05');

        consensus = computeConsensus(pData.pipelines, geneNames, userFc, userPval);

        const experimentUniverse = geneNames;

        // Fleiss Kappa
        const numGenes = geneNames.length;
        const numPipelines = pData.pipelines.length;
        const binaryMatrix = Array.from({ length: numGenes }, () => new Array(numPipelines).fill(0));
        pData.pipelines.forEach((pipe, pIdx) => {
          pipe.results.forEach((res, gIdx) => {
            if (res && Math.abs(res.log2fc) >= userFc && res.padj <= userPval) {
              const actualIdx = res.gene_index !== undefined ? res.gene_index : gIdx;
              if (binaryMatrix[actualIdx]) {
                binaryMatrix[actualIdx][pIdx] = 1;
              }
            }
          });
        });
        const kappa = computeFleissKappa(binaryMatrix);


        // Pathways
        const pipelineEnrichments = await Promise.all(pData.pipelines.map(async pipe => {
          const degs = pipe.results.filter(r => r && Math.abs(r.log2fc) >= userFc && r.padj <= userPval).map((r, i) => geneNames[r.gene_index !== undefined ? r.gene_index : i]).filter(Boolean);
          if (degs.length === 0) return [];
          return await runGProfilerEnrichment(degs, experimentUniverse, 'hsapiens');
        }));
        const pathways = computePathwayConsensus(pipelineEnrichments, 0.2);

        setSummaryData({
          sampleNames,
          geneNames,
          controlCount: controlIndices.length,
          treatedCount: treatedIndices.length,
          consensus,
          pipelines: pData.pipelines,
          fleissKappa: kappa,
          pathways
        });
      } catch (err) {
        console.error('Error computing summary for export:', err);
      } finally {
        setLoading(false);
      }
    }

    computeSummary();
  }, []);

  const downloadCSV = (filename, content) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadConsensusDEGs = () => {
    if (!summaryData) return;
    const pipelineNames = summaryData.pipelines.map(p => p.name.replace(/ /g, '_') + '_Padj');
    const headers = ['Gene_Name', 'Consensus_Score', 'Category', 'Median_Log2FC', 'Min_Adj_PValue', ...pipelineNames];
    
    const rows = summaryData.consensus.map(c => [
      c.geneName,
      c.consensusScore,
      c.category,
      c.log2fc_median != null && !isNaN(c.log2fc_median) ? c.log2fc_median.toFixed(3) : "NA",
      c.pvalues.length > 0 ? Math.min(...c.pvalues.filter(p => p != null && !isNaN(p))).toExponential(4) : "NA",
      ...summaryData.pipelines.map((_, i) => c.pvalues[i] != null && !isNaN(c.pvalues[i]) ? c.pvalues[i].toExponential(4) : "NA")
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV('BioInsight360_Consensus_DEGs.csv', csv);
  };

  const handleDownloadMultiPipeline = () => {
    if (!summaryData) return;
    const headers = ['Gene_Name', 'Pipeline_Name', 'Log2FC', 'Raw_PValue', 'Adj_PValue_BH', 'Cohens_D'];
    const rows = [];
    summaryData.pipelines.forEach(p => {
      p.results.forEach(r => {
        if (r) {
          rows.push([
            summaryData.geneNames[r.gene_index] || 'Unknown',
            `"${p.name}"`,
            r.log2fc.toFixed(3),
            r.pvalue ? r.pvalue.toExponential(4) : (r.padj ? r.padj.toExponential(4) : "1e+00"),
            r.padj ? r.padj.toExponential(4) : "1e+00",
            r.cohens_d ? r.cohens_d.toFixed(3) : "NA"
          ]);
        }
      });
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV('BioInsight360_MultiPipeline_FullResults.csv', csv);
  };

  const handleDownloadPathways = () => {
    if (!summaryData) return;
    const headers = ['Term_ID', 'Pathway_Name', 'Source_DB', 'Consensus_Score', 'Pipelines_Enriched', 'Category', 'Median_Adj_PValue', 'Overlapping_Genes'];
    const rows = summaryData.pathways.map(p => [
      p.term,
      `"${p.name}"`,
      p.source,
      p.consensusScore,
      p.pipelinesEnriched,
      p.category,
      p.adjPValueMedian != null && !isNaN(p.adjPValueMedian) ? p.adjPValueMedian.toExponential(4) : "NA",
      `"${p.overlappingGenes.join(';')}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV('BioInsight360_Pathway_Consensus.csv', csv);
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('pdf-report-content');
    if (!element) return;
    import('html2pdf.js').then((html2pdfModule) => {
      const html2pdf = html2pdfModule.default;
      const opt = {
        margin:       0.5,
        filename:     'BioInsight360_Analysis_Report.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(element).save();
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#0f172a' }}>
        <div className="pulse" style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
        <h2 style={{ color: '#d97706', marginBottom: '0.5rem' }}>Preparing Export Data & Executive Summary...</h2>
        <p style={{ color: '#1e293b' }}>Aggregating 6 pipeline outputs, consensus scores, and pathway stability metrics</p>
      </div>
    );
  }

  if (!summaryData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#0f172a', padding: '2rem' }}>
        <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>⚠️ Analysis Not Found</h2>
        <p style={{ color: '#1e293b', marginBottom: '2rem' }}>Please run the consensus analysis first or wait for processing to finish.</p>
        <button onClick={() => window.location.href='/consensus'} className="btn-primary" style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}>
          Go to Consensus Dashboard
        </button>
      </div>
    );
  }

  const {
    sampleNames,
    geneNames,
    controlCount,
    treatedCount,
    consensus,
    fleissKappa,
    pathways
  } = summaryData;

  const totalConsensusDEGs = consensus.filter(c => c.category === 'high_confidence' || c.category === 'moderate_confidence').length;
  const highConfDEGs = consensus.filter(c => c.category === 'high_confidence').length;
  const topPathways = pathways.filter(p => p.category === 'high_confidence').map(p => p.name).slice(0, 3).join(', ');

  let kappaLabel = 'Substantial Agreement';
  if (fleissKappa > 0.8) kappaLabel = 'Almost Perfect Agreement';
  else if (fleissKappa < 0.4) kappaLabel = 'Moderate Agreement';

  return (
    <div style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '2rem', background: 'linear-gradient(to right, #d97706, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Export Results & Analysis Report
      </h1>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        <button 
          onClick={handleDownloadConsensusDEGs}
          className="glass-card"
          style={{ padding: '1.5rem', border: '1px solid #0284c7', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', textAlign: 'center' }}
        >
          <span style={{ fontSize: '2rem' }}></span>
          <span style={{ fontWeight: 'bold', color: '#0f172a' }}>Download Consensus DEGs</span>
          <span style={{ fontSize: '0.8rem', color: '#0284c7', background: 'rgba(6, 182, 212, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>CSV Format</span>
        </button>

        <button 
          onClick={handleDownloadMultiPipeline}
          className="glass-card"
          style={{ padding: '1.5rem', border: '1px solid #0d9488', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', textAlign: 'center' }}
        >
          <span style={{ fontSize: '2rem' }}></span>
          <span style={{ fontWeight: 'bold', color: '#0f172a' }}>Full 6-Pipeline Results</span>
          <span style={{ fontSize: '0.8rem', color: '#0d9488', background: 'rgba(139, 92, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>CSV Format</span>
        </button>

        <button 
          onClick={handleDownloadPathways}
          className="glass-card"
          style={{ padding: '1.5rem', border: '1px solid #059669', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', textAlign: 'center' }}
        >
          <span style={{ fontSize: '2rem' }}></span>
          <span style={{ fontWeight: 'bold', color: '#0f172a' }}>Pathway Consensus</span>
          <span style={{ fontSize: '0.8rem', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>CSV Format</span>
        </button>

        <button 
          onClick={handleDownloadPDF}
          className="btn-primary"
          style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', textAlign: 'center' }}
        >
          <span style={{ fontSize: '2rem' }}>📄</span>
          <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>Save Full Report</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>(PDF Format)</span>
        </button>
      </div>

      {/* Executive Summary Printable Card */}
      <div id="pdf-report-content" className="glass-card" style={{ padding: '3rem', maxWidth: '950px', margin: '0 auto', border: '1px solid rgba(15, 23, 42, 0.1)', background: '#ffffff' }}>
        <div style={{ borderBottom: '2px solid rgba(15, 23, 42, 0.1)', paddingBottom: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0', color: '#0f172a', fontWeight: 'bold' }}>Executive Summary</h2>
            <p style={{ margin: 0, color: '#0284c7', fontWeight: '600' }}>BioInsight 360 Multi-Method Consensus Platform</p>
          </div>
          <div style={{ color: '#334155', fontSize: '0.9rem' }}>
            Date: {new Date().toLocaleDateString()}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <h4 style={{ color: '#0f172a', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em', fontWeight: '800' }}>Dataset Overview</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#0f172a' }}>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#334155', display: 'inline-block', width: '140px', fontWeight: '600' }}>Total Samples:</span> <strong>{sampleNames.length}</strong>
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#334155', display: 'inline-block', width: '140px', fontWeight: '600' }}>Total Genes:</span> <strong>{geneNames.length}</strong>
              </li>
              <li style={{ padding: '0.5rem 0' }}>
                <span style={{ color: '#334155', display: 'inline-block', width: '140px', fontWeight: '600' }}>Experimental Groups:</span> <strong>Control ({controlCount}), Treated ({treatedCount})</strong>
              </li>
            </ul>
          </div>

          <div>
            <h4 style={{ color: '#0f172a', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em', fontWeight: '800' }}>Consensus Metrics</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#0f172a' }}>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#334155', display: 'inline-block', width: '160px', fontWeight: '600' }}>Total Consensus DEGs:</span> <strong style={{ color: '#059669', fontWeight: '800' }}>{totalConsensusDEGs}</strong> ({highConfDEGs} High Conf.)
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#334155', display: 'inline-block', width: '160px', fontWeight: '600' }}>Fleiss' Kappa Score:</span> <strong style={{ color: '#2563eb', fontWeight: '800' }}>κ = {fleissKappa.toFixed(2)}</strong> ({kappaLabel})
              </li>
              <li style={{ padding: '0.5rem 0' }}>
                <span style={{ color: '#334155', display: 'inline-block', width: '160px', fontWeight: '600' }}>Top Stable Pathways:</span> <strong style={{ color: '#0f172a' }}>{topPathways || 'None Significant'}</strong>
              </li>
            </ul>
          </div>
        </div>

        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '1.5rem', color: '#0f172a', lineHeight: '1.6' }}>
          {totalConsensusDEGs > 0 ? (
            <p style={{ margin: 0 }}>
              This report outlines findings derived from 6 distinct statistical pipelines (CPM+t-test, CPM+MW, UQ+t-test, UQ+MW, MoR+t-test, MoR+MW). The <strong style={{ color: '#0284c7', fontSize: '1.1rem' }}>{totalConsensusDEGs} genes</strong> classified as Consensus DEGs demonstrate robust differential expression regardless of the normalization or statistical method applied, representing highly reliable biological signals suitable for downstream experimental validation.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              This report outlines findings derived from 6 distinct statistical pipelines. <strong style={{ color: '#0284c7', fontSize: '1.1rem' }}>No genes</strong> were classified as Consensus DEGs under the current thresholds. This indicates that either the experimental condition did not induce strong, widespread transcriptional changes among these {geneNames.length} genes, or the variance between biological replicates was too high to achieve statistical significance across multiple methodologies.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
