'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ConsensusVolcano from '../../components/ConsensusVolcano';
import AgreementHeatmap from '../../components/AgreementHeatmap';
import UpSetPlot from '../../components/UpSetPlot';
import JaccardMatrix from '../../components/JaccardMatrix';
import DEGTable from '../../components/DEGTable';
import { runAllPipelines, computeConsensus, computePairwiseJaccard, computeFleissKappa, formatDownstreamPipelines } from '../../lib/consensus';

export default function ConsensusPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fc, setFc] = useState(1.0);
  const [pval, setPval] = useState(0.05);
  const [activeTab, setActiveTab] = useState('volcano');
  const [selectedGene, setSelectedGene] = useState(null);

  const [pipelineData, setPipelineData] = useState(null);
  const [consensusResults, setConsensusResults] = useState([]);
  const [jaccardMatrix, setJaccardMatrix] = useState([]);
  const [fleissKappa, setFleissKappa] = useState(0);
  const [analysisMode, setAnalysisMode] = useState('compute');

  useEffect(() => {
    async function loadAndRunConsensus() {
      try {
        setLoading(true);
        const mode = Storage.getItem('analysisMode') || 'compute';
        setAnalysisMode(mode);

        let pData;
        
        if (mode === 'downstream') {
          const deseq2 = JSON.parse(Storage.getItem('deseq2Data'));
          const edger = JSON.parse(Storage.getItem('edgerData'));
          const limma = JSON.parse(Storage.getItem('limmaData'));
          pData = formatDownstreamPipelines(deseq2, edger, limma);
        } else {
          let rawCountsCSV = Storage.getItem('filteredCounts') || Storage.getItem('rawCounts');
          let rawMetaCSV = Storage.getItem('rawMetadata');

          if (!rawCountsCSV || !rawMetaCSV) {
            const countRes = await fetch('/data/demo_counts.csv');
            rawCountsCSV = await countRes.text();
            const metaRes = await fetch('/data/demo_metadata.csv');
            rawMetaCSV = await metaRes.text();
          }

          // Parse CSVs
          const lines = rawCountsCSV.trim().split('\n');
          const header = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          const sampleNames = header.slice(1);

          const geneNames = [];
          const rawMatrix = [];
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            geneNames.push(parts[0]);
            rawMatrix.push(parts.slice(1).map(Number));
          }

          const metaLines = rawMetaCSV.trim().split('\n');
          const groupMap = {};
          for (let i = 1; i < metaLines.length; i++) {
            if (!metaLines[i].trim()) continue;
            const [s, g] = metaLines[i].split(',').map(str => str.trim().replace(/^"|"$/g, ''));
            groupMap[s] = g.toLowerCase();
          }

          const controlIndices = [];
          const treatedIndices = [];
          sampleNames.forEach((name, idx) => {
            const group = groupMap[name] || (idx % 2 === 0 ? 'control' : 'treated');
            if (group.includes('control') || group.includes('untreated')) {
              controlIndices.push(idx);
            } else {
              treatedIndices.push(idx);
            }
          });

          pData = runAllPipelines(rawMatrix, geneNames, controlIndices, treatedIndices);
        }

        setPipelineData(pData);

        // Compute Consensus & Agreement Metrics
        recalculateConsensus(pData, pData.geneNames, parseFloat(fc), parseFloat(pval));
      } catch (err) {
        console.error('Error running consensus engine:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAndRunConsensus();
  }, []);

  const recalculateConsensus = (pData, geneNames, currentFc, currentPval) => {
    if (!pData) return;
    const consensus = computeConsensus(pData.pipelines, geneNames, currentFc, currentPval);
    setConsensusResults(consensus);

    const jMatrix = computePairwiseJaccard(pData.pipelines, currentFc, currentPval);
    setJaccardMatrix(jMatrix);

    // Compute binary matrix for Fleiss' Kappa (genes x pipelines)
    const numGenes = geneNames.length;
    const numPipelines = pData.pipelines.length;
    const binaryMatrix = Array.from({ length: numGenes }, () => new Array(numPipelines).fill(0));

    pData.pipelines.forEach((pipe, pIdx) => {
      pipe.results.forEach((res, gIdx) => {
        if (res && Math.abs(res.log2fc) >= currentFc && res.padj <= currentPval) {
          binaryMatrix[gIdx][pIdx] = 1;
        }
      });
    });

    const kappa = computeFleissKappa(binaryMatrix);
    setFleissKappa(kappa);
  };

  const handleSliderChange = (newFc, newPval) => {
    setFc(newFc);
    setPval(newPval);
    if (pipelineData) {
      recalculateConsensus(pipelineData, pipelineData.geneNames, parseFloat(newFc), parseFloat(newPval));
    }
  };

  const highConfCount = consensusResults.filter(r => r && r.category === 'high_confidence').length;
  const modConfCount = consensusResults.filter(r => r && r.category === 'moderate_confidence').length;
  const sensCount = consensusResults.filter(r => r && r.category === 'method_sensitive').length;
  const totalDEGs = highConfCount + modConfCount;

  let kappaLabel = 'Poor Agreement';
  let kappaColor = '#e11d48';
  if (fleissKappa > 0.8) { kappaLabel = 'Almost Perfect Agreement'; kappaColor = '#059669'; }
  else if (fleissKappa > 0.6) { kappaLabel = 'Substantial Agreement'; kappaColor = '#0284c7'; }
  else if (fleissKappa > 0.4) { kappaLabel = 'Moderate Agreement'; kappaColor = '#d97706'; }

  const pipelineNames = analysisMode === 'downstream' ? ['DESeq2', 'edgeR', 'limma'] : [
    'CPM + Welch t-test',
    'CPM + Mann-Whitney',
    'UQ + Welch t-test',
    'UQ + Mann-Whitney',
    'MoR + Welch t-test',
    'MoR + Mann-Whitney'
  ];

  return (
    <div style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #e11d48, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            {analysisMode === 'downstream' ? 'Downstream Integration Dashboard' : 'Multi-Method Consensus DGE Analysis'}
          </h1>
          <p style={{ color: '#1e293b', fontSize: '1rem', marginTop: '0.5rem' }}>
            {analysisMode === 'downstream' 
              ? 'Simultaneous evaluation of 3 industry-standard tools (DESeq2, edgeR, limma)' 
              : 'Simultaneous evaluation of 6 analytical pipelines (3 normalizations × 2 statistical tests)'}
          </p>
        </div>

        <button 
          onClick={() => router.push('/pathways')}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 'bold' }}
        >
          Proceed to Pathway Analysis →
        </button>
      </div>

      {/* Threshold Controls Bar */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '3rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ color: '#334155', fontWeight: '600' }}>|log₂FC| Threshold</label>
            <span style={{ fontWeight: 'bold', color: '#0284c7' }}>{fc}</span>
          </div>
          <input 
            type="range" 
            min="0.2" 
            max="3.0" 
            step="0.1" 
            value={fc} 
            onChange={e => handleSliderChange(e.target.value, pval)} 
            style={{ width: '100%', accentColor: '#0284c7' }} 
          />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ color: '#334155', fontWeight: '600' }}>Adjusted p-value Cutoff</label>
            <span style={{ fontWeight: 'bold', color: '#0d9488' }}>{pval}</span>
          </div>
          <input 
            type="range" 
            min="0.001" 
            max="1.0" 
            step="0.005" 
            value={pval} 
            onChange={e => handleSliderChange(fc, e.target.value)} 
            style={{ width: '100%', accentColor: '#0d9488' }} 
          />
        </div>

        <button 
          onClick={() => handleSliderChange(fc, pval)} 
          className="btn-secondary"
          style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}
        >
           Re-evaluate
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem', background: 'rgba(226, 232, 240, 0.4)', borderRadius: '16px' }}>
          <div className="pulse" style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h2 style={{ color: '#e11d48', marginBottom: '0.5rem' }}>{analysisMode === 'downstream' ? 'Merging Pipeline Results...' : 'Running 6 Statistical Pipelines...'}</h2>
          <p style={{ color: '#1e293b' }}>{analysisMode === 'downstream' ? "Computing consensus across DESeq2, edgeR, and limma" : "Computing CPM, Upper Quartile, Size Factors, Welch's t-test, Mann-Whitney U, and Fleiss' Kappa"}</p>
        </div>
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Total Consensus DEGs</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#0f172a' }}>{totalDEGs}</div>
              <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '0.25rem' }}>Significant in ≥3 pipelines</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Fleiss' Kappa Score</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: kappaColor }}>
                κ = {fleissKappa.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.75rem', color: kappaColor, marginTop: '0.25rem' }}>{kappaLabel}</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>High Confidence DEGs</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#059669' }}>{highConfCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>● Significant in ≥{analysisMode === 'downstream' ? 3 : 5}/{pipelineNames.length} pipelines</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Method-Sensitive DEGs</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#f97316' }}>{sensCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#f97316', marginTop: '0.25rem' }}>● Unstable across methods</div>
            </div>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', background: 'rgba(241, 245, 249, 0.6)' }}>
              {[
                { id: 'volcano', label: ' Consensus Volcano Plot' },
                { id: 'agreement', label: ' Method Agreement & Overlap' },
                { id: 'deg', label: ' Consensus DEG Table' },
                { id: 'pipeline', label: ` ${pipelineNames.length}-Pipeline Breakdown` }
              ].map(tab => (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id)} 
                  style={{ 
                    flex: 1, 
                    padding: '1rem', 
                    background: activeTab === tab.id ? 'rgba(6, 182, 212, 0.1)' : 'transparent', 
                    color: activeTab === tab.id ? '#0284c7' : '#1e293b', 
                    border: 'none', 
                    cursor: 'pointer', 
                    fontWeight: 'bold', 
                    borderBottom: activeTab === tab.id ? '3px solid #0284c7' : '3px solid transparent', 
                    transition: 'all 0.2s',
                    fontSize: '0.95rem'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div style={{ padding: '1.5rem', minHeight: '480px' }}>
              {activeTab === 'volcano' && (
                <div style={{ display: 'grid', gridTemplateColumns: selectedGene ? '3fr 1fr' : '1fr', gap: '1.5rem' }}>
                  <div style={{ height: '480px' }}>
                    <ConsensusVolcano 
                      consensusResults={consensusResults} 
                      fcThreshold={parseFloat(fc)} 
                      pThreshold={parseFloat(pval)} 
                      onGeneSelect={(geneName) => {
                        const target = consensusResults.find(r => r && r.geneName === geneName);
                        setSelectedGene(target);
                      }}
                    />
                  </div>

                  {selectedGene && (
                    <div style={{ background: 'rgba(241, 245, 249, 0.7)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(15, 23, 42, 0.1)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '1.2rem', color: '#0284c7', fontWeight: 'bold' }}>{selectedGene.geneName}</h4>
                        <button onClick={() => setSelectedGene(null)} style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        Category: <span className={selectedGene.category === 'high_confidence' ? 'badge-high' : selectedGene.category === 'moderate_confidence' ? 'badge-moderate' : 'badge-sensitive'}>
                          {selectedGene.category.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        Consensus Score: <strong style={{ color: '#fff' }}>{selectedGene.consensusScore}/{pipelineNames.length} Pipelines</strong>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        Median log₂FC: <strong style={{ color: selectedGene.log2fc_median > 0 ? '#059669' : '#e11d48' }}>{selectedGene.log2fc_median.toFixed(2)}</strong>
                      </div>

                      <div style={{ marginTop: '0.5rem' }}>
                        <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#334155' }}>Pipeline Detection Matrix:</h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                          {pipelineNames.map((name, pIdx) => {
                            const pipe = pipelineData.pipelines[pIdx];
                            const res = pipe.results.find(r => r && r.gene_index === selectedGene.geneName);
                            // gene_index in downstream is numerical, but geneName was pushed into geneNames array
                            const targetRes = pipe.results.find(r => r && pipelineData.geneNames[r.gene_index] === selectedGene.geneName) || res;
                            const isSig = targetRes && targetRes.padj <= parseFloat(pval) && Math.abs(targetRes.log2fc) >= parseFloat(fc);
                            return (
                              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(226, 232, 240, 0.5)', borderRadius: '4px' }}>
                                <span>{name}</span>
                                <span style={{ color: isSig ? '#059669' : '#334155', fontWeight: 'bold' }}>{isSig ? '✓ SIG' : '✗ NS'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'agreement' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div>
                    <h4 style={{ color: '#334155', marginBottom: '1rem' }}> Gene Agreement Heatmap (Top 50 DEGs)</h4>
                    <div style={{ height: '400px' }}>
                      <AgreementHeatmap pipelines={pipelineData.pipelines} consensusResults={consensusResults} fcThreshold={parseFloat(fc)} pThreshold={parseFloat(pval)} />
                    </div>
                  </div>

                  <div>
                    <h4 style={{ color: '#334155', marginBottom: '1rem' }}> Pairwise Jaccard Similarity Matrix</h4>
                    <div style={{ height: '400px' }}>
                      <JaccardMatrix jaccardMatrix={jaccardMatrix} pipelineNames={pipelineNames} />
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                    <h4 style={{ color: '#334155', marginBottom: '1rem' }}> DEG Intersection Sizes (UpSet Diagram)</h4>
                    <div style={{ height: '300px' }}>
                      <UpSetPlot consensusResults={consensusResults} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'deg' && (
                <DEGTable consensusResults={consensusResults} onGeneSelect={(geneName) => {
                  const target = consensusResults.find(r => r && r.geneName === geneName);
                  setSelectedGene(target);
                  setActiveTab('volcano');
                }} />
              )}

              {activeTab === 'pipeline' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                  {pipelineData.pipelines.map((pipe, idx) => {
                    const sigCount = pipe.results.filter(r => r && Math.abs(r.log2fc) >= parseFloat(fc) && r.padj <= parseFloat(pval)).length;
                    return (
                      <div key={idx} className="glass-card" style={{ padding: '1.25rem' }}>
                        <h4 style={{ color: '#0284c7', fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          {pipelineNames[idx]}
                        </h4>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', margin: '0.5rem 0' }}>
                          {sigCount} DEGs
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#1e293b' }}>
                          {analysisMode === 'downstream' ? (
                            <>Pipeline: <strong>{pipe.name}</strong></>
                          ) : (
                            <>
                              Normalization: <strong>{pipe.name.split(' + ')[0]}</strong><br/>
                              Statistical Test: <strong>{pipe.name.split(' + ')[1]}</strong>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
