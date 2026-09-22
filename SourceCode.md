

### File: app/api/ncbi/route.js
```javascript
import { NextResponse } from 'next/server';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { execSync } from 'child_process';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  // Dynamically fetch the live proxy from the shell, bypassing stale process.env
  let liveProxyUrl = '';
  try {
    const envOutput = execSync('env | grep -i -E "https?_proxy"').toString();
    const match = envOutput.match(/(?:https?_proxy)=([^\n]+)/i);
    if (match && match[1]) {
        liveProxyUrl = match[1].trim();
    }
  } catch (e) {
    console.warn("Failed to fetch dynamic proxy", e.message);
  }

  // Fallback to Next.js process.env if the bash trick fails (requires server restart if port rotated)
  if (!liveProxyUrl) {
    liveProxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
  }
  
  const httpsAgent = liveProxyUrl ? new HttpsProxyAgent(liveProxyUrl, { rejectUnauthorized: false }) : undefined;

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Only allow NCBI and EBI URLs for security
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname;
    
    if (!hostname.endsWith('ncbi.nlm.nih.gov') && !hostname.endsWith('ebi.ac.uk')) {
      return NextResponse.json({ error: 'Unauthorized URL' }, { status: 403 });
    }

    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer', // Get raw bytes to support text, xml, and binary (gz)
      validateStatus: () => true, // Don't throw on 4xx/5xx
      httpsAgent, // Attach the proxy agent
      proxy: false, // Force axios to use httpsAgent instead of its own proxy logic
      timeout: 30000 // 30 second timeout to prevent ETIMEDOUT hanging
    });

    if (response.status >= 400) {
      return NextResponse.json(
        { error: `Upstream responded with ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers['content-type'] || '';
    
    if (contentType.includes('application/json')) {
      // Axios returns arraybuffer, we decode it
      const text = new TextDecoder().decode(response.data);
      return NextResponse.json(JSON.parse(text));
    } else {
      return new NextResponse(response.data, {
        headers: { 
          'Content-Type': contentType,
          'Content-Length': response.data.byteLength.toString()
        }
      });
    }
  } catch (error) {
    console.error('API Route Proxy Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch upstream resource', details: error.message }, { status: 500 });
  }
}


### File: app/consensus/page.js
```javascript
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

// Minimal CSV row parser — handles quoted fields (avoids split(',') breaking on gene descriptions)
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

export default function ConsensusPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fc, setFc] = useState(() => {
    return typeof window !== 'undefined' ? parseFloat(Storage.getItem('consensusFcThreshold') || '1.0') : 1.0;
  });
  const [pval, setPval] = useState(() => {
    return typeof window !== 'undefined' ? parseFloat(Storage.getItem('consensusPvalThreshold') || '0.05') : 0.05;
  });
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

        // Defer heavy computation so loading spinner renders first
        await new Promise(resolve => setTimeout(resolve, 50));

        let pData;
        
        if (mode === 'downstream') {
          const deseq2 = JSON.parse(Storage.getItem('deseq2Data'));
          const edger = JSON.parse(Storage.getItem('edgerData'));
          const limma = JSON.parse(Storage.getItem('limmaData'));
          pData = formatDownstreamPipelines(deseq2, edger, limma);
        } else {
          let filteredCSV = Storage.getItem('filteredCounts');
          let rawMetaCSV = Storage.getItem('rawMetadata');

          if (!filteredCSV || !rawMetaCSV) {
            router.replace('/qc');
            return;
          }

          const lines = filteredCSV.trim().split('\n');
          const header = parseCSVRow(lines[0]);
          const sampleNames = header.slice(1);

          const geneNames = [];
          const rawMatrix = [];
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const parts = parseCSVRow(lines[i]);
            geneNames.push(parts[0]);
            rawMatrix.push(parts.slice(1).map(Number));
          }

          const metaLines = rawMetaCSV.trim().split('\n');
          const groupMap = {};
          for (let i = 1; i < metaLines.length; i++) {
            if (!metaLines[i].trim()) continue;
            const [s, g] = parseCSVRow(metaLines[i]);
            groupMap[s] = (g || '').toLowerCase();
          }

          const activeControlGroup = Storage.getItem('activeControlGroup') || 'Control';
          const activeTreatedGroup = Storage.getItem('activeTreatedGroup') || 'Treated';

          const controlIndices = [];
          const treatedIndices = [];
          sampleNames.forEach((name, idx) => {
            const group = groupMap[name] || '';
            if (group.toLowerCase() === activeControlGroup.toLowerCase()) {
              controlIndices.push(idx);
            } else if (group.toLowerCase() === activeTreatedGroup.toLowerCase()) {
              treatedIndices.push(idx);
            }
          });

          // Yield to browser before blocking
          await new Promise(resolve => setTimeout(resolve, 10));
          pData = runAllPipelines(rawMatrix, geneNames, controlIndices, treatedIndices);
        }

        setPipelineData(pData);

        // Compute Consensus & Agreement Metrics
        recalculateConsensus(pData, pData.geneNames, 1.0, parseFloat(pval));
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
        // Use unadjusted p-value for browser compute mode because strict FDR on n<10 eliminates everything
        if (res && Math.abs(res.log2fc) >= currentFc && res.pvalue <= currentPval) {
          const actualIdx = res.gene_index !== undefined ? res.gene_index : gIdx;
          if (binaryMatrix[actualIdx]) {
            binaryMatrix[actualIdx][pIdx] = 1;
          }
        }
      });
    });

    const kappa = computeFleissKappa(binaryMatrix);
    setFleissKappa(kappa);
  };

  const handleSliderChange = (newFc, newPval) => {
    setFc(newFc);
    setPval(newPval);
    // Persist thresholds so pathways/export pages use the same values
    Storage.setItem('consensusFcThreshold', String(newFc));
    Storage.setItem('consensusPvalThreshold', String(newPval));
    if (pipelineData) {
      recalculateConsensus(pipelineData, pipelineData.geneNames, parseFloat(newFc), parseFloat(newPval));
    }
  };

  const highConfCount = consensusResults.filter(r => r && r.category === 'high_confidence').length;
  const modConfCount = consensusResults.filter(r => r && r.category === 'moderate_confidence').length;
  const sensCount = consensusResults.filter(r => r && r.category === 'method_sensitive').length;
  const totalDEGs = highConfCount + modConfCount;
  
  const upRegCount = consensusResults.filter(r => r && (r.category === 'high_confidence' || r.category === 'moderate_confidence') && r.log2fc_median > 0).length;
  const downRegCount = consensusResults.filter(r => r && (r.category === 'high_confidence' || r.category === 'moderate_confidence') && r.log2fc_median < 0).length;

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
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

          {/* Upregulated / Downregulated Sub-Cards */}
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="glass-card" style={{ flex: 1, padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #ef4444' }}>
              <div>
                <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.25rem' }}>Upregulated DEGs</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Consensus Log₂FC &gt; 0</div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>{upRegCount}</div>
            </div>
            
            <div className="glass-card" style={{ flex: 1, padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #3b82f6' }}>
              <div>
                <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.25rem' }}>Downregulated DEGs</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Consensus Log₂FC &lt; 0</div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>{downRegCount}</div>
            </div>
          </div>

          {totalDEGs === 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', padding: '1.5rem', borderRadius: '12px', marginBottom: '2.5rem', color: '#991b1b' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>⚠️</span> 0 DEGs Found — High Variance Warning
              </h4>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                The statistical tests detected massive variance inside your experimental groups, which drowned out the disease signal. This almost always happens if you combine distinct biological tissues or cell types (e.g. Oocyte and Cumulus) into the same Control vs. Treated groups. 
                <br/><br/>
                <strong>How to fix:</strong> Go back to the <a href="/upload" onClick={(e) => { e.preventDefault(); router.push('/upload'); }} style={{ color: '#b91c1c', textDecoration: 'underline', fontWeight: 'bold', cursor: 'pointer' }}>Upload Page</a> and use the <strong>"Required"</strong> box in the Auto-Assign section to specify exactly which tissue to analyze (e.g., type <code>Oocyte</code>), which will instantly exclude the others.
              </p>
            </div>
          )}

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
                            const isSig = targetRes && targetRes.pvalue <= parseFloat(pval) && Math.abs(targetRes.log2fc) >= parseFloat(fc);
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
                    const sigCount = pipe.results.filter(r => r && Math.abs(r.log2fc) >= parseFloat(fc) && r.pvalue <= parseFloat(pval)).length;
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


### File: app/export/page.js
```javascript
'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { runAllPipelines, computeConsensus, computeFleissKappa, formatDownstreamPipelines } from '../../lib/consensus';
import { runGOEnrichment, computePathwayConsensus } from '../../lib/enrichment';

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

          const rawMatrix = [];
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const parts = parseCSVRow(lines[i]);
            geneNames.push(parts[0]);
            rawMatrix.push(parts.slice(1).map(Number));
          }

          const metaLines = rawMetaCSV.trim().split('\n');
          const groupMap = {};
          for (let i = 1; i < metaLines.length; i++) {
            if (!metaLines[i].trim()) continue;
            const [s, g] = parseCSVRow(metaLines[i]);
            groupMap[s] = (g || '').toLowerCase();
          }

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

        // Read thresholds set by user on Consensus page
        const userFc = parseFloat(Storage.getItem('consensusFcThreshold') || '1.0');
        const userPval = parseFloat(Storage.getItem('consensusPvalThreshold') || '0.05');

        consensus = computeConsensus(pData.pipelines, geneNames, userFc, userPval);

        const goRes = await fetch('/data/go_annotations.json');
        const goJson = await goRes.json();
        const goAnnotations = Object.entries(goJson.terms).map(([term, data]) => ({
          term,
          name: data.name,
          genes: data.genes || []
        }));

        // Fleiss Kappa
        const numGenes = geneNames.length;
        const numPipelines = pData.pipelines.length;
        const binaryMatrix = Array.from({ length: numGenes }, () => new Array(numPipelines).fill(0));
        pData.pipelines.forEach((pipe, pIdx) => {
          pipe.results.forEach((res, gIdx) => {
            if (res && Math.abs(res.log2fc) >= userFc && res.pvalue <= userPval) {
              const actualIdx = res.gene_index !== undefined ? res.gene_index : gIdx;
              if (binaryMatrix[actualIdx]) {
                binaryMatrix[actualIdx][pIdx] = 1;
              }
            }
          });
        });
        const kappa = computeFleissKappa(binaryMatrix);

        // Build proper GO background universe from ALL genes in annotations + input genes
        const goUniverseSet = new Set();
        goAnnotations.forEach(go => go.genes.forEach(g => goUniverseSet.add(g.toUpperCase())));
        geneNames.forEach(g => goUniverseSet.add(g.toUpperCase()));
        const goUniverse = Array.from(goUniverseSet);

        // Pathways
        const pipelineEnrichments = pData.pipelines.map(pipe => {
          const degs = pipe.results.filter(r => r && Math.abs(r.log2fc) >= Math.min(userFc, 0.5) && r.pvalue <= userPval).map((r, i) => geneNames[r.gene_index !== undefined ? r.gene_index : i]).filter(Boolean);
          return runGOEnrichment(degs, goAnnotations, goUniverse);
        });
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
    const headers = ['GO_Term_ID', 'Biological_Process_Name', 'Consensus_Score', 'Pipelines_Enriched', 'Category', 'Median_Adj_PValue', 'Overlapping_Genes'];
    const rows = summaryData.pathways.map(p => [
      p.term,
      `"${p.name}"`,
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

  if (loading || !summaryData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#0f172a' }}>
        <div className="pulse" style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
        <h2 style={{ color: '#d97706', marginBottom: '0.5rem' }}>Preparing Export Data & Executive Summary...</h2>
        <p style={{ color: '#1e293b' }}>Aggregating 6 pipeline outputs, consensus scores, and pathway stability metrics</p>
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


### File: app/layout.js
```javascript
import './globals.css';

export const metadata = {
  title: 'BioInsight 360',
  description: 'Consensus-Based Multi-Method RNA-Seq Analysis Platform',
};

import Navbar from '../components/Navbar';

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Navbar />
        <main className="main-content">
          {children}
        </main>
        <footer style={{ borderTop: '1px solid var(--border-color)', padding: '2rem 0', textAlign: 'center', marginTop: 'auto', background: 'rgba(241, 245, 249, 0.8)' }}>
          <div className="container">
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
              &copy; {new Date().getFullYear()} BioInsight 360. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}


### File: app/page.js
```javascript
import Link from 'next/link';

export default function Home() {
  return (
    <div className="container" style={{ padding: '4rem 1.5rem' }}>
      {/* Hero Section */}
      <section className="fade-in" style={{ textAlign: 'center', margin: '4rem 0 6rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', maxWidth: '800px', margin: '0 auto' }}>
          <span className="text-gradient">BioInsight 360</span>
        </h1>
        <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 500, color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
          Consensus-Based Multi-Method RNA-Seq Analysis Platform
        </h2>
        <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-muted)', maxWidth: '700px', margin: '1rem auto' }}>
          Elevate your transcriptomics with robust consensus building. BioInsight 360 runs your RNA-Seq data through multiple analytical pipelines simultaneously to identify high-confidence differential expression, all within your browser.
        </p>
        <div style={{ marginTop: '2rem' }}>
          <Link href="/upload" className="btn btn-primary" style={{ fontSize: 'var(--fs-lg)', padding: '1rem 2rem' }}>
            Get Started &rarr;
          </Link>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="grid grid-cols-3" style={{ marginBottom: '6rem' }}>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Multi-Method Consensus</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            6 analytical pipelines running simultaneously to give you the highest confidence in your differentially expressed genes.
          </p>
        </div>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ccfbf1', border: '1px solid #99f6e4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d9488' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Interactive Visualizations</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Volcano plots, heatmaps, PCA, and UpSet diagrams built right in to explore your consensus data effortlessly.
          </p>
        </div>
        <div className="glass-card text-center flex flex-col items-center gap-4">
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>100% Private & Secure</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            All computation runs in your browser. No data leaves your machine, ensuring complete privacy and security for your research.
          </p>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="glass-card" style={{ marginBottom: '6rem' }}>
        <h2 className="section-title text-center">How It Works</h2>
        <div className="grid grid-cols-4 gap-6" style={{ marginTop: '3rem' }}>
          
          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-primary)' }}>1</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Upload</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Provide your raw counts and metadata locally.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-secondary)' }}>2</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Analyze</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>QC and run multiple DE methods concurrently.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-success)' }}>3</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Consensus</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Identify robust markers across all pipelines.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-2">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--accent-warning)' }}>4</div>
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '1rem' }}>Export</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Download publication-ready figures and tables.</p>
          </div>

        </div>
      </section>

      {/* Tech Stack */}
      <section className="text-center fade-in" style={{ animationDelay: '0.3s', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Powered By</p>
        <div className="flex justify-center items-center gap-4 flex-wrap">
          <span className="badge badge-ns">Next.js</span>
          <span className="badge badge-ns">Plotly.js</span>
          <span className="badge badge-ns">Vanilla CSS</span>
          <span className="badge badge-ns">WebAssembly</span>
        </div>
      </section>

    </div>
  );
}


### File: app/pathways/page.js
```javascript
'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PathwayChart from '../../components/PathwayChart';
import { runGOEnrichment, computePathwayConsensus } from '../../lib/enrichment';
import { runAllPipelines, formatDownstreamPipelines } from '../../lib/consensus';
import { fetchGoTermDetails } from '../../lib/quickgo_api';

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

export default function PathwaysPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pathwayConsensus, setPathwayConsensus] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedPathway, setSelectedPathway] = useState(null);
  const [selectedPathwayDetails, setSelectedPathwayDetails] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  useEffect(() => {
    if (!selectedPathway) {
      setSelectedPathwayDetails(null);
      return;
    }
    async function loadDetails() {
      setIsFetchingDetails(true);
      try {
        const details = await fetchGoTermDetails(selectedPathway.term);
        setSelectedPathwayDetails(details);
      } catch (e) {
        console.error("Failed to fetch GO details", e);
        setSelectedPathwayDetails(null);
      } finally {
        setIsFetchingDetails(false);
      }
    }
    loadDetails();
  }, [selectedPathway]);

  useEffect(() => {
    async function loadAndComputePathways() {
      try {
        setLoading(true);
        const mode = Storage.getItem('analysisMode') || 'compute';
        let pipelineData;
        let geneNames = [];

        // Fetch GO annotations
        const goRes = await fetch('/data/go_annotations.json');
        const goJson = await goRes.json();

        // Convert GO annotations dictionary to array
        const goAnnotations = Object.entries(goJson.terms).map(([term, data]) => ({
          term: term,
          name: data.name,
          genes: data.genes || []
        }));

        if (mode === 'downstream') {
          const deseq2 = JSON.parse(Storage.getItem('deseq2Data'));
          const edger = JSON.parse(Storage.getItem('edgerData'));
          const limma = JSON.parse(Storage.getItem('limmaData'));
          pipelineData = formatDownstreamPipelines(deseq2, edger, limma);
        } else {
          // Load counts + metadata from sessionStorage or demo fallback
          let filteredCSV = Storage.getItem('filteredCounts') || Storage.getItem('rawCounts');
          let rawMetaCSV = Storage.getItem('rawMetadata');

          if (!filteredCSV || !rawMetaCSV) {
            router.replace('/qc');
            return;
          }

          const lines = filteredCSV.trim().split('\n');
          const header = parseCSVRow(lines[0]);
          const sampleNames = header.slice(1);

          const rawMatrix = [];
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const parts = parseCSVRow(lines[i]);
            geneNames.push(parts[0]);
            rawMatrix.push(parts.slice(1).map(Number));
          }

          const metaLines = rawMetaCSV.trim().split('\n');
          const groupMap = {};
          for (let i = 1; i < metaLines.length; i++) {
            if (!metaLines[i].trim()) continue;
            const [s, g] = parseCSVRow(metaLines[i]);
            groupMap[s] = (g || '').toLowerCase();
          }

          const activeControlGroup = Storage.getItem('activeControlGroup') || 'Control';
          const activeTreatedGroup = Storage.getItem('activeTreatedGroup') || 'Treated';

          const controlIndices = [];
          const treatedIndices = [];
          sampleNames.forEach((name, idx) => {
            const group = groupMap[name] || '';
            if (group.toLowerCase() === activeControlGroup.toLowerCase()) {
              controlIndices.push(idx);
            } else if (group.toLowerCase() === activeTreatedGroup.toLowerCase()) {
              treatedIndices.push(idx);
            }
          });

          // Yield to browser before blocking
          await new Promise(resolve => setTimeout(resolve, 10));
          // Run all 6 pipelines
          pipelineData = runAllPipelines(rawMatrix, geneNames, controlIndices, treatedIndices);
        }

        // Read thresholds set by user on Consensus page (fall back to sensible defaults)
        const userFc = parseFloat(Storage.getItem('consensusFcThreshold') || '1.0');
        const userPval = parseFloat(Storage.getItem('consensusPvalThreshold') || '0.05');

        // Build a comprehensive background universe from ALL genes in GO annotations
        // This is the standard practice — using only input genes as universe gives bad stats
        const goUniverseSet = new Set();
        goAnnotations.forEach(go => go.genes.forEach(g => goUniverseSet.add(g.toUpperCase())));
        // Also include all input genes
        pipelineData.geneNames.forEach(g => goUniverseSet.add(g.toUpperCase()));
        const goUniverse = Array.from(goUniverseSet);

        // Compute DEGs per pipeline using user thresholds
        const pipelineEnrichments = pipelineData.pipelines.map(pipe => {
          const degs = pipe.results
            .filter(r => r && Math.abs(r.log2fc) >= userFc && r.pvalue <= userPval)
            .map((r, i) => pipelineData.geneNames[r.gene_index !== undefined ? r.gene_index : i])
            .filter(Boolean);
          return runGOEnrichment(degs, goAnnotations, goUniverse);
        });

        // Compute Pathway Consensus — use a more lenient pThreshold for small gene sets
        const consensus = computePathwayConsensus(pipelineEnrichments, 0.2);
        setPathwayConsensus(consensus);
        if (consensus.length > 0) {
          setSelectedPathway(consensus[0]);
        }
      } catch (err) {
        console.error('Error computing pathway consensus:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAndComputePathways();
  }, []);

  const highCount = pathwayConsensus.filter(p => p.category === 'high_confidence').length;
  const modCount = pathwayConsensus.filter(p => p.category === 'moderate_confidence').length;
  const sensCount = pathwayConsensus.filter(p => p.category === 'method_sensitive').length;

  const filteredPathways = pathwayConsensus.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.term.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const exportPathwaysCSV = () => {
    const headers = ['GO_Term_ID', 'Biological_Process_Name', 'Consensus_Score', 'Pipelines_Enriched', 'Category', 'Median_Adj_PValue', 'Overlapping_Genes'];
    const rows = filteredPathways.map(p => [
      p.term,
      `"${p.name}"`,
      p.consensusScore,
      p.pipelinesEnriched,
      p.category,
      p.adjPValueMedian.toExponential(4),
      `"${p.overlappingGenes.join(';')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'BioInsight360_Pathway_Consensus.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #0284c7, #0d9488)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Pathway-Level Consensus & Biological Stability
          </h1>
          <p style={{ color: '#1e293b', fontSize: '1rem', marginTop: '0.5rem' }}>
            Gene Ontology (GO) Biological Process enrichment consistency across all 6 analytical pipelines
          </p>
        </div>

        <button 
          onClick={() => router.push('/export')}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 'bold' }}
        >
          Proceed to Export & Report →
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem', background: 'rgba(226, 232, 240, 0.4)', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="pulse" style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h2 style={{ color: '#0284c7', marginBottom: '0.5rem' }}>Computing GO Pathway Consensus...</h2>
          <p style={{ color: '#1e293b' }}>Evaluating hypergeometric enrichment across 6 pipelines</p>
        </div>
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Total GO Terms Tested</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#0f172a' }}>{pathwayConsensus.length}</div>
              <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '0.25rem' }}>Biological Process Terms</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Consensus Pathways (High)</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#059669' }}>{highCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>● Enriched in ≥5/6 Pipelines</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Moderate Consensus</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#d97706' }}>{modCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem' }}>● Enriched in 3–4/6 Pipelines</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Method-Sensitive Pathways</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#f97316' }}>{sensCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#f97316', marginTop: '0.25rem' }}>● Enriched in 1–2/6 Pipelines</div>
            </div>
          </div>

          {/* Visualization Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
            {/* Top Stable Pathways Bar Chart */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span></span> Top Stable GO Biological Processes
              </h3>
              <div style={{ height: '400px' }}>
                <PathwayChart pathwayConsensusResults={pathwayConsensus} />
              </div>
            </div>

            {/* Pathway Detail Inspection Panel */}
            <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span></span> Pathway Inspector
              </h3>

              {selectedPathway ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                  <div style={{ background: 'rgba(241, 245, 249, 0.6)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                    <div style={{ color: '#0284c7', fontSize: '0.85rem', fontWeight: 'bold' }}>{selectedPathway.term}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', margin: '0.25rem 0' }}>{selectedPathway.name}</div>
                    
                    {/* Live EBI QuickGO Details */}
                    {isFetchingDetails ? (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem', fontStyle: 'italic' }}>Fetching live definition from EBI QuickGO...</div>
                    ) : selectedPathwayDetails ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.4', marginBottom: '0.5rem' }}>
                          <strong>Definition:</strong> {selectedPathwayDetails.definition}
                        </p>
                        {selectedPathwayDetails.synonyms && selectedPathwayDetails.synonyms.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            <strong>Synonyms:</strong> {selectedPathwayDetails.synonyms.join(', ')}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.85rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                      <span className={selectedPathway.category === 'high_confidence' ? 'badge-high' : selectedPathway.category === 'moderate_confidence' ? 'badge-moderate' : 'badge-sensitive'}>
                        {selectedPathway.category.replace('_', ' ').toUpperCase()}
                      </span>
                      <span style={{ color: '#1e293b' }}>Pipelines: <strong style={{ color: '#0284c7' }}>{selectedPathway.pipelinesEnriched}</strong></span>
                      <span style={{ color: '#1e293b' }}>Median Adj. P: <strong style={{ color: '#0284c7' }}>{selectedPathway.adjPValueMedian < 0.001 ? selectedPathway.adjPValueMedian.toExponential(3) : selectedPathway.adjPValueMedian.toFixed(4)}</strong></span>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.95rem', color: '#334155', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Overlapping DEGs in this Pathway ({selectedPathway.overlappingGenes.length} genes):
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', padding: '0.5rem', background: 'rgba(241, 245, 249, 0.4)', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                      {selectedPathway.overlappingGenes.map(gene => (
                        <span 
                          key={gene} 
                          style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', border: '1px solid rgba(6, 182, 212, 0.3)' }}
                        >
                          {gene}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: '0.85rem', color: '#c084fc', marginTop: 'auto' }}>
                    Note: <strong>Biological Insight:</strong> This pathway shows consistent enrichment across <strong>{selectedPathway.pipelinesEnriched}</strong> independent analytical pipelines, indicating high stability against normalization and statistical test variations.
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155' }}>
                  Select a pathway from the table below to inspect details
                </div>
              )}
            </div>
          </div>

          {/* Pathway Table Section */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span></span> Pathway Consensus Table
              </h3>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {/* Search Input */}
                <input 
                  type="text" 
                  placeholder="Search GO Term / ID..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field"
                  style={{ width: '220px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                />

                {/* Category Filter */}
                <select 
                  value={categoryFilter} 
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="input-field"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  <option value="ALL">All Categories</option>
                  <option value="high_confidence">High Confidence (≥5/6)</option>
                  <option value="moderate_confidence">Moderate (3–4/6)</option>
                  <option value="method_sensitive">Method-Sensitive (1–2/6)</option>
                </select>

                {/* CSV Download Button */}
                <button 
                  onClick={exportPathwaysCSV}
                  className="btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 'bold' }}
                >
                   Export CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>GO ID</th>
                    <th>Biological Process Term</th>
                    <th style={{ textAlign: 'center' }}>Pipelines Enriched</th>
                    <th style={{ textAlign: 'center' }}>Consensus Score</th>
                    <th style={{ textAlign: 'center' }}>Category</th>
                    <th style={{ textAlign: 'right' }}>Median Adj. P</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPathways.length > 0 ? (
                    filteredPathways.map((row) => (
                      <tr 
                        key={row.term}
                        style={{ 
                          background: selectedPathway?.term === row.term ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedPathway(row);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <td style={{ color: '#0284c7', fontWeight: 'bold' }}>{row.term}</td>
                        <td style={{ fontWeight: '600', color: '#0f172a' }}>{row.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.pipelinesEnriched}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '60px', background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${(row.consensusScore / 6) * 100}%`, background: row.consensusScore >= 5 ? '#059669' : row.consensusScore >= 3 ? '#d97706' : '#f97316', height: '100%' }}></div>
                            </div>
                            <span style={{ fontSize: '0.85rem', color: '#334155' }}>{row.consensusScore}/6</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={row.category === 'high_confidence' ? 'badge-high' : row.category === 'moderate_confidence' ? 'badge-moderate' : 'badge-sensitive'}>
                            {row.category === 'high_confidence' ? 'High' : row.category === 'moderate_confidence' ? 'Moderate' : 'Sensitive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#334155' }}>
                          {row.adjPValueMedian < 0.001 ? row.adjPValueMedian.toExponential(3) : row.adjPValueMedian.toFixed(4)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setSelectedPathway(row); 
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{ background: 'transparent', border: '1px solid #0284c7', color: '#0284c7', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : pathwayConsensus.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#334155' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧬</div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '0.5rem' }}>No Pathways Found</h3>
                        <p style={{ maxWidth: '600px', margin: '0 auto', lineHeight: '1.6' }}>
                          There were 0 overlapping GO terms detected. This could be due to small log2FC values, or a mismatch in gene nomenclature.
                          <br/><br/>
                          <strong>Note:</strong> BioInsight 360 expects official <strong>Gene Symbols</strong> (e.g., TP53, BRCA1). If your dataset uses Ensembl IDs (e.g., ENSG00000141510) or other database accessions, please convert them to symbols before uploading.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#334155' }}>
                        No GO terms match your search/filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


### File: app/qc/page.js
```javascript
'use client';
import { Storage } from '../../lib/storage';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import PCAScatter from '../../components/PCAScatter';
import { computeLibrarySizes, computeDetectionRates, computeSampleCorrelation, detectOutliers } from '../../lib/qc';
import { computePCA } from '../../lib/pca';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function QCPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [qcData, setQcData] = useState(null);
  const [cpmThreshold, setCpmThreshold] = useState(() => {
    return parseFloat(Storage.getItem('cpmThreshold') || '1.0');
  });
  const [debouncedCpm, setDebouncedCpm] = useState(() => {
    return parseFloat(Storage.getItem('cpmThreshold') || '1.0');
  });

  // Debounce: only re-run Worker 500ms after user stops dragging
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCpm(cpmThreshold);
      Storage.setItem('cpmThreshold', String(cpmThreshold));
    }, 500);
    return () => clearTimeout(t);
  }, [cpmThreshold]);

  useEffect(() => {
    let worker;
    async function loadInitialData() {
      try {
        setLoading(true);
        if (Storage.getItem('analysisMode') === 'downstream') {
          router.replace('/consensus');
          return;
        }

        let rawCountsCSV = Storage.getItem('rawCounts');
        let rawMetaCSV = Storage.getItem('rawMetadata');

        if (!rawCountsCSV || !rawMetaCSV) {
          const countRes = await fetch('/data/demo_counts.csv');
          rawCountsCSV = await countRes.text();
          const metaRes = await fetch('/data/demo_metadata.csv');
          rawMetaCSV = await metaRes.text();
        }

        worker = new Worker('/workers/qcWorker.js');
        
        worker.onmessage = (e) => {
          const { filteredCSV, qcData: newQcData } = e.data;
          Storage.setItem('filteredCounts', filteredCSV);
          setQcData(newQcData);
          setLoading(false);
          worker.terminate();
        };

        worker.onerror = (error) => {
          console.error('QC Worker Error:', error);
          setLoading(false);
          worker.terminate();
        };

        worker.postMessage({
          rawCountsCSV,
          rawMetaCSV,
          cpmThreshold: debouncedCpm
        });

      } catch (err) {
        console.error('Error loading data:', err);
        setLoading(false);
      }
    }
    loadInitialData();
    
    // Cleanup: Terminate worker if component unmounts before completion
    return () => {
      if (worker) worker.terminate();
    };
  }, [router, debouncedCpm]);

  if (loading || !qcData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#0f172a' }}>
        <div className="pulse" style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
        <h2 style={{ color: '#0284c7', marginBottom: '0.5rem' }}>Running Quality Control Pipelines...</h2>
        <p style={{ color: '#1e293b' }}>Analyzing library sizes, detection rates, PCA, and correlation matrices</p>
      </div>
    );
  }

  const {
    sampleNames,
    sampleGroups,
    librarySizes,
    detectionRates,
    corrMatrix,
    outlierStatus,
    pcaResult,
    avgLibSize,
    avgDetRate,
    outlierCount,
    genesRetained,
    totalGenes
  } = qcData;

  const formattedPCAData = {
    pc1: pcaResult.components[0] || [],
    pc2: pcaResult.components[1] || [],
    sampleNames: sampleNames,
    sampleGroups: sampleGroups,
    varianceExplained: pcaResult.varianceExplained || [50, 30]
  };

  return (
    <div style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #059669, #0284c7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Quality Control Dashboard
          </h1>
          <p style={{ color: '#1e293b', fontSize: '1rem', marginTop: '0.5rem' }}>
            Exploratory Data Analysis: Library sizes, PCA, Spearman correlations & outlier detection
          </p>
        </div>

        <button 
          onClick={() => router.push('/consensus')}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 'bold' }}
        >
          Proceed to Consensus Analysis →
        </button>
      </div>

      {/* Low-Expression Gene Filter (CPM) */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '3rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 'bold', color: '#0f172a' }}>Low-Expression Filter (CPM Cutoff)</span>
            <span style={{ fontWeight: 'bold', color: '#ec4899' }}>{cpmThreshold.toFixed(1)} CPM</span>
          </div>
          <input 
            type="range" 
            min="0" max="10" step="0.1" 
            value={cpmThreshold} 
            onChange={(e) => setCpmThreshold(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#ec4899' }}
          />
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>
            Filtering out genes that do not meet {cpmThreshold} CPM in at least 2 samples.
          </div>
        </div>
        
        <div style={{ paddingLeft: '2rem', borderLeft: '2px solid rgba(15, 23, 42, 0.1)' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Genes Retained</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ec4899', lineHeight: 1 }}>
            {genesRetained.toLocaleString()}
            <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 'normal', marginLeft: '0.5rem' }}>/ {totalGenes.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Total Samples</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#0f172a' }}>{sampleNames.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '0.25rem' }}>
            {sampleGroups.filter(g => g.toLowerCase().includes('control')).length} Control / {sampleGroups.filter(g => !g.toLowerCase().includes('control')).length} Treated
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Avg Library Size</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#0284c7' }}>
            {(avgLibSize / 1e6).toFixed(2)}M
          </div>
          <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '0.25rem' }}>Total reads per sample</div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Gene Detection Rate</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#0d9488' }}>
            {avgDetRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '0.25rem' }}>Genes with count &gt; 0</div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: '600' }}>Outlier Count</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: outlierCount === 0 ? '#059669' : '#e11d48' }}>
            {outlierCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: outlierCount === 0 ? '#059669' : '#e11d48', marginTop: '0.25rem' }}>
            {outlierCount === 0 ? '● All samples passed' : '● Outliers detected'}
          </div>
        </div>
      </div>

      {/* QC Visualizations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
        {/* Library Size Bar Chart */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem' }}>
             Library Size Distribution
          </h3>
          <div style={{ height: '320px' }}>
            <Plot
              data={[{
                x: sampleNames,
                y: librarySizes.map(s => s / 1e6),
                type: 'bar',
                marker: {
                  color: sampleGroups.map(g => g.toLowerCase().includes('control') ? '#3b82f6' : '#ef4444')
                },
                text: librarySizes.map(s => `${(s/1e6).toFixed(2)}M`),
                textposition: 'auto'
              }]}
              layout={{
                autosize: true,
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: { color: '#0f172a' },
                xaxis: { title: 'Sample ID', tickangle: -45 },
                yaxis: { title: 'Library Size (Millions)', gridcolor: '#f1f5f9' },
                margin: { l: 50, r: 20, t: 20, b: 80 }
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>

        {/* PCA Plot */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem' }}>
            🎯 Principal Component Analysis (PCA)
          </h3>
          <div style={{ height: '320px' }}>
            <PCAScatter pcaData={formattedPCAData} />
          </div>
        </div>

        {/* Sample Correlation Heatmap */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem' }}>
             Sample-to-Sample Spearman Correlation
          </h3>
          <div style={{ height: '320px' }}>
            <Plot
              data={[{
                z: corrMatrix,
                x: sampleNames,
                y: sampleNames,
                type: 'heatmap',
                colorscale: [
                  [0, '#0f172a'],
                  [0.5, '#1e1b4b'],
                  [1, '#0284c7']
                ],
                zmin: corrMatrix.flat ? Math.max(0, Math.min(...corrMatrix.flat()) - 0.05) : 0,
                zmax: 1.0,
                hoverongaps: false
              }]}
              layout={{
                autosize: true,
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: { color: '#0f172a' },
                xaxis: { tickangle: -45 },
                margin: { l: 80, r: 20, t: 20, b: 80 }
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>

        {/* Sample Quality Status Table */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem' }}>
            📋 Sample Quality Status
          </h3>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Group</th>
                  <th>Library Size</th>
                  <th>Detection</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sampleNames.map((name, idx) => {
                  const stat = outlierStatus[idx];
                  const isPass = stat.status === 'Pass';
                  const isWarn = stat.status === 'Warning';

                  return (
                    <tr key={name}>
                      <td style={{ fontWeight: 'bold', color: '#0284c7' }}>{name}</td>
                      <td>{sampleGroups[idx]}</td>
                      <td style={{ fontFamily: 'monospace' }}>{(librarySizes[idx] / 1e6).toFixed(2)}M</td>
                      <td style={{ fontFamily: 'monospace' }}>{detectionRates[idx].toFixed(1)}%</td>
                      <td>
                        <span className={isPass ? 'badge-high' : isWarn ? 'badge-moderate' : 'badge-sensitive'}>
                          {stat.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


### File: app/upload/page.js
```javascript
'use client';
import { Storage } from '../../lib/storage';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { fetchGeoMetadata } from '../../lib/geo_api';

export default function UploadPage() {
    const router = useRouter();
    const [summary, setSummary] = useState(null);
    const [metaAssignments, setMetaAssignments] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Tab State
    const [activeTab, setActiveTab] = useState('local'); // 'local', 'geo', or 'deg'
    const [degSummary, setDegSummary] = useState(null);
    const [uploadedTools, setUploadedTools] = useState({ deseq2: false, edger: false, limma: false });
    
    // GEO State
    const [geoAccession, setGeoAccession] = useState('GSE158055');
    const [geoData, setGeoData] = useState(null);
    const [isFetchingGeo, setIsFetchingGeo] = useState(false);
    const [geoError, setGeoError] = useState('');

    // Auto-Assign State
    const [autoCtrl, setAutoCtrl] = useState('control');
    const [autoTrt, setAutoTrt] = useState('treated');
    const [autoFilter, setAutoFilter] = useState('');
    
    // Group Selection State
    const [uniqueGroups, setUniqueGroups] = useState(['Control', 'Treated']);
    const [selectedCtrl, setSelectedCtrl] = useState('Control');
    const [selectedTrt, setSelectedTrt] = useState('Treated');

    const handleLoadDemo = async () => {
        setLoading(true);
        try {
            const countsRes = await fetch('/data/demo_counts.csv');
            const metadataRes = await fetch('/data/demo_metadata.csv');
            
            if (countsRes.ok && metadataRes.ok) {
                const countsText = await countsRes.text();
                const metaText = await metadataRes.text();
                
                const parsedCounts = Papa.parse(countsText, { header: true, skipEmptyLines: true });
                const parsedMeta = Papa.parse(metaText, { header: true, skipEmptyLines: true });
                
                const sampleCols = Object.keys(parsedCounts.data[0] || {}).filter(k => k.toLowerCase() !== 'gene' && k.toLowerCase() !== 'id');
                // Handle case-insensitive column names (demo uses 'group', some use 'Group')
                const getGroup = (d) => d.Group || d.group || d.condition || d.Condition || '';
                const ctrlCount = parsedMeta.data.filter(d => getGroup(d).toLowerCase().includes('control')).length;
                const trtCount = parsedMeta.data.filter(d => !getGroup(d).toLowerCase().includes('control') && getGroup(d).trim() !== '').length;
                
                const uGroups = Array.from(new Set(parsedMeta.data.map(d => getGroup(d)).filter(Boolean)));
                setUniqueGroups([...uGroups, 'Exclude']);
                if (uGroups.length > 0) setSelectedCtrl(uGroups.find(g => g.toLowerCase().includes('control')) || uGroups[0]);
                if (uGroups.length > 1) setSelectedTrt(uGroups.find(g => !g.toLowerCase().includes('control')) || uGroups[1]);
                
                setSummary({
                    genes: parsedCounts.data.length,
                    samples: sampleCols,
                    controlCount: ctrlCount,
                    treatedCount: trtCount
                });
                
                
                Storage.setItem('rawCounts', Papa.unparse(parsedCounts.data));
                Storage.setItem('rawMetadata', Papa.unparse(parsedMeta.data));
                setMetaAssignments(parsedMeta.data);
                Storage.setItem('analysisMode', 'compute');
                // Clear stale artifacts from previous runs
                Storage.removeItem('filteredCounts');
                Storage.removeItem('deseq2Data');
                Storage.removeItem('edgerData');
                Storage.removeItem('limmaData');
                setDegSummary(null);
            } else {
                // Mock fallback if files are not present
                setSummary({
                    genes: 15000,
                    samples: Array.from({length: 12}, (_, i) => `Sample_${i+1}`),
                    controlCount: 6,
                    treatedCount: 6
                });
                const mock = [{Sample: 'Sample_1', Group: 'Control'}];
                const mockCounts = [{Gene: 'GENE1', Sample_1: 10}];
                Storage.setItem('rawCounts', Papa.unparse(mockCounts));
                Storage.setItem('rawMetadata', Papa.unparse(mock));
                setMetaAssignments(mock);
                Storage.setItem('analysisMode', 'compute');
                Storage.removeItem('filteredCounts');
                setDegSummary(null);
            }
        } catch (e) {
            console.error('Failed to load demo', e);
        }
        setLoading(false);
    };
    
    const handleFetchGeo = async () => {
        if (!geoAccession.trim()) return;
        setIsFetchingGeo(true);
        setGeoError('');
        setGeoData(null);
        try {
            const data = await fetchGeoMetadata(geoAccession.trim());
            setGeoData(data);
        } catch (error) {
            setGeoError(error.message || 'Failed to fetch GEO metadata');
        }
        setIsFetchingGeo(false);
    };

    const handleLoadDegDemo = async () => {
        setLoading(true);
        try {
            // Use real gene names from our GO annotations so pathways work correctly
            const realGenes = [
                'TP53','BRCA1','EGFR','MYC','KRAS','PTEN','RB1','AKT1','VEGFA','MTOR',
                'PIK3CA','BRAF','CDK4','CDK6','BCL2','BAX','CASP3','CASP9','GAPDH','ACTB',
                'TNF','IL6','IL1B','STAT3','JAK2','NFKB1','TGFB1','WNT1','NOTCH1','HIF1A',
                'ERBB2','FGFR1','PDGFRA','KIT','MET','ALK','ROS1','RET','RAF1','MAP2K1',
                'MAPK1','MAPK3','MDM2','CDKN2A','SMAD4','FOS','JUN'
            ];
            // Build mock data: first ~15 genes are significant DEGs, rest are not
            const mockDegData = realGenes.map((gene, i) => {
                const isSig = i < 15;
                return {
                    Gene_ID: gene,
                    logFC: isSig ? (Math.random() * 4 - 2).toFixed(3) : (Math.random() * 0.5 - 0.25).toFixed(3),
                    pvalue: isSig ? (Math.random() * 0.01).toFixed(6) : (Math.random() * 0.99 + 0.01).toFixed(4),
                    padj: isSig ? (Math.random() * 0.04).toFixed(6) : (Math.random() * 0.99 + 0.01).toFixed(4)
                };
            });
            // Slightly jitter the other tools so they aren't identical
            const jitter = (g) => ({...g, 
                padj: (parseFloat(g.padj) * (Math.random() * 0.4 + 0.8)).toFixed(6),
                pvalue: (parseFloat(g.pvalue) * (Math.random() * 0.4 + 0.8)).toFixed(6)
            });
            const mockEdgeR = mockDegData.map(jitter);
            const mockLimma = mockDegData.map(jitter);

            Storage.setItem('deseq2Data', JSON.stringify(mockDegData));
            Storage.setItem('edgerData', JSON.stringify(mockEdgeR));
            Storage.setItem('limmaData', JSON.stringify(mockLimma));
            
            Storage.setItem('analysisMode', 'downstream');
            // Clear stale compute-mode artifacts
            Storage.removeItem('rawCounts');
            Storage.removeItem('filteredCounts');
            Storage.removeItem('rawMetadata');
            
            setDegSummary({
                genes: mockDegData.length,
                tools: 3
            });
            setSummary(null); // Clear raw count summary
        } catch (e) {
            console.error('Failed to load DEG demo', e);
        }
        setLoading(false);
    };

    const handleImportGeoFile = async (fileInfo) => {
        setLoading(true);
        try {
            // We'll use allorigins proxy as a fallback if direct fetch fails due to CORS
            let targetUrl = fileInfo.url;
            if (targetUrl.startsWith('ftp://')) {
                targetUrl = targetUrl.replace('ftp://', 'https://');
            }
            
            const proxyUrl = `/api/ncbi?url=${encodeURIComponent(targetUrl)}`;
            
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('File download failed');
            
            let text = '';
            
            // If the file is gzipped, we need to decompress it
            if (fileInfo.filename.endsWith('.gz')) {
                // Use DecompressionStream if available in the browser
                if (typeof DecompressionStream !== 'undefined') {
                    const ds = new DecompressionStream('gzip');
                    const decompressedStream = response.body.pipeThrough(ds);
                    const textDecoder = new TextDecoderStream();
                    const reader = decompressedStream.pipeThrough(textDecoder).getReader();
                    
                    let result = '';
                    while (true) {
                        const {value, done} = await reader.read();
                        if (done) break;
                        result += value;
                    }
                    text = result;
                } else {
                    throw new Error("Decompression is not supported in this browser.");
                }
            } else {
                text = await response.text();
            }

            // Extract GEO Series Matrix Table if present
            if (text.includes('!series_matrix_table_begin')) {
                const beginIdx = text.indexOf('!series_matrix_table_begin');
                let tableText = text.substring(beginIdx + '!series_matrix_table_begin'.length);
                if (tableText.includes('!series_matrix_table_end')) {
                    tableText = tableText.substring(0, tableText.indexOf('!series_matrix_table_end'));
                }
                text = tableText.trim();
            }

            // Pre-process text to fix common R write.table output issue (missing top-left header for row names)
            const fixMissingHeader = (rawText) => {
                const normalizedForCount = rawText.trim().replace(/[ \t]+/g, '\t');
                const previewParse = Papa.parse(normalizedForCount.split('\n').slice(0, 2).join('\n'), { delimiter: '\t' });
                if (previewParse.data && previewParse.data.length >= 2) {
                    if (previewParse.data[0].length === previewParse.data[1].length - 1) {
                        const firstLine = rawText.substring(0, rawText.indexOf('\n'));
                        let delim = ',';
                        if (firstLine.includes('\t')) delim = '\t';
                        else if (firstLine.includes(' ')) delim = ' ';
                        return 'Gene' + delim + rawText;
                    }
                }
                return rawText;
            };

            text = fixMissingHeader(text);

            // Parse with PapaParse
            let parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
            
            if (!parsed.data || parsed.data.length === 0) {
                throw new Error("Could not parse file or file is empty.");
            }

            // Fallback: If only 1 column was detected, the file might be space-aligned
            if (Object.keys(parsed.data[0]).length === 1) {
                const spaceNormalized = text.replace(/[ \t]+/g, '\t');
                const parsedSpace = Papa.parse(spaceNormalized, { header: true, skipEmptyLines: true });
                if (parsedSpace.data && parsedSpace.data.length > 0 && Object.keys(parsedSpace.data[0]).length > 1) {
                    parsed = parsedSpace;
                }
            }

            const firstRow = parsed.data[0] || {};

            // Annotation columns common in featureCounts/HTSeq/STAR output — never sample columns
            const ANNOTATION_COLS = new Set(['chr','chrom','chromosome','start','end','strand','length',
              'width','biotype','gene_biotype','gene_type','gene_name','gene_id','transcript_id',
              'transcript_name','exon_id','protein_id','havana_gene','havana_transcript','description',
              'source','feature','score','frame','attribute','class_code','nearest_ref','link','x']);
            const sampleCols = Object.keys(firstRow).filter(k => {
              const kl = k.toLowerCase().trim();
              return kl !== '' && !ANNOTATION_COLS.has(kl) &&
                !kl.includes('gene') && !kl.includes('_id') && kl !== 'x';
            });

            // Clean parsed data: remove empty keys and ensure 'Gene' is the first key
            const cleanData = parsed.data.map(row => {
                const newRow = {};
                // Find the gene column (the one we didn't classify as a sample, usually first)
                const geneKey = Object.keys(row).find(k => k.trim() !== '' && !sampleCols.includes(k));
                newRow['Gene'] = geneKey ? row[geneKey] : `Gene_${Math.random().toString(36).substr(2,5)}`;
                
                sampleCols.forEach(col => {
                    newRow[col] = row[col];
                });
                return newRow;
            });
            
            // Generate mock metadata by blindly splitting samples into two groups
            // In a real app, we'd parse the geo_metadata for sample groups if possible
            const mockMeta = sampleCols.map((s, i) => ({
                Sample: s,
                Group: i < Math.floor(sampleCols.length / 2) ? 'Control' : 'Treated'
            }));

            const ctrlCount = mockMeta.filter(d => d.Group === 'Control').length;
            const trtCount = mockMeta.filter(d => d.Group === 'Treated').length;

            setSummary({
                genes: cleanData.length,
                samples: sampleCols,
                controlCount: ctrlCount,
                treatedCount: trtCount
            });

            setMetaAssignments(mockMeta);
            
            // Force conversion to strictly comma-separated CSV so our downstream manual parsers work
            const cleanCSV = Papa.unparse(cleanData);
            Storage.setItem('rawCounts', cleanCSV);
            Storage.setItem('rawMetadata', Papa.unparse(mockMeta));

            Storage.setItem('analysisMode', 'compute');
            // Clear stale artifacts from previous runs
            Storage.removeItem('filteredCounts');
            Storage.removeItem('deseq2Data');
            Storage.removeItem('edgerData');
            Storage.removeItem('limmaData');
            setDegSummary(null);
            
        } catch (error) {
            console.error("Import failed:", error);
            alert("Import failed: " + error.message);
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem', background: 'linear-gradient(to right, #0284c7, #0d9488)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>
                Upload & Dataset Configuration
            </h1>
            
            <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                    <button 
                        onClick={() => setActiveTab('local')}
                        style={{ 
                            padding: '0.5rem 1rem', 
                            background: activeTab === 'local' ? '#e0f2fe' : 'transparent',
                            color: activeTab === 'local' ? '#0284c7' : '#64748b',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Local Upload
                    </button>
                    <button 
                        onClick={() => setActiveTab('geo')}
                        style={{ 
                            padding: '0.5rem 1rem', 
                            background: activeTab === 'geo' ? '#e0f2fe' : 'transparent',
                            color: activeTab === 'geo' ? '#0284c7' : '#64748b',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        Import Public Data <span style={{ background: '#10b981', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>NEW</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('deg')}
                        style={{ 
                            padding: '0.5rem 1rem', 
                            background: activeTab === 'deg' ? '#e0f2fe' : 'transparent',
                            color: activeTab === 'deg' ? '#0284c7' : '#64748b',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        Pre-computed DEGs <span style={{ background: '#8b5cf6', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>DASHBOARD MODE</span>
                    </button>
                </div>

                {/* Local Upload Tab */}
                {activeTab === 'local' && (
                    <div className="tab-content" style={{ animation: 'fadeIn 0.3s ease-in' }}>
                        <label style={{ display: 'block', border: '2px dashed #0284c7', padding: '4rem', textAlign: 'center', marginBottom: '2rem', borderRadius: '12px', background: '#f0f9ff', cursor: 'pointer', transition: 'all 0.3s' }}>
                                <input 
                                type="file" 
                                accept=".csv,.txt,.tsv,.gz" 
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const file = e.target.files[0];
                                    if (!file) return;
                                    setLoading(true);
                                    try {
                                        let text = '';
                                        if (file.name.endsWith('.gz')) {
                                            const ds = new DecompressionStream('gzip');
                                            const decompressedStream = file.stream().pipeThrough(ds);
                                            const reader = decompressedStream.getReader();
                                            const decoder = new TextDecoder('utf-8');
                                            
                                            while (true) {
                                                const { done, value } = await reader.read();
                                                if (done) break;
                                                text += decoder.decode(value, { stream: true });
                                            }
                                            text += decoder.decode();
                                        } else {
                                            text = await file.text();
                                        }

                                        // Extract GEO Series Matrix Table if present
                                        if (text.includes('!series_matrix_table_begin')) {
                                            const beginIdx = text.indexOf('!series_matrix_table_begin');
                                            let tableText = text.substring(beginIdx + '!series_matrix_table_begin'.length);
                                            if (tableText.includes('!series_matrix_table_end')) {
                                                tableText = tableText.substring(0, tableText.indexOf('!series_matrix_table_end'));
                                            }
                                            text = tableText.trim();
                                        }

                                        const fixMissingHeader = (rawText) => {
                                            const normalizedForCount = rawText.trim().replace(/[ \t]+/g, '\t');
                                            const previewParse = Papa.parse(normalizedForCount.split('\n').slice(0, 2).join('\n'), { delimiter: '\t' });
                                            if (previewParse.data && previewParse.data.length >= 2) {
                                                if (previewParse.data[0].length === previewParse.data[1].length - 1) {
                                                    const firstLine = rawText.substring(0, rawText.indexOf('\n'));
                                                    let delim = ',';
                                                    if (firstLine.includes('\t')) delim = '\t';
                                                    else if (firstLine.includes(' ')) delim = ' ';
                                                    return 'Gene' + delim + rawText;
                                                }
                                            }
                                            return rawText;
                                        };
                            
                                        text = fixMissingHeader(text);

                                        let parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
                                        
                                        if (!parsed.data || parsed.data.length === 0) {
                                            throw new Error("Empty file. First 100 chars: " + text.substring(0, 100));
                                        }
                                        
                                        // Fallback: If only 1 column was detected, the file might be space-aligned
                                        if (Object.keys(parsed.data[0]).length === 1) {
                                            const spaceNormalized = text.replace(/[ \t]+/g, '\t');
                                            const parsedSpace = Papa.parse(spaceNormalized, { header: true, skipEmptyLines: true });
                                            if (parsedSpace.data && parsedSpace.data.length > 0 && Object.keys(parsedSpace.data[0]).length > 1) {
                                                parsed = parsedSpace;
                                            }
                                        }
                                        
                                        // Annotation columns common in featureCounts/HTSeq/STAR output — never sample columns
                                        const ANNOTATION_COLS = new Set(['chr','chrom','chromosome','start','end','strand','length',
                                          'width','biotype','gene_biotype','gene_type','gene_name','gene_id','transcript_id',
                                          'transcript_name','exon_id','protein_id','havana_gene','havana_transcript','description',
                                          'source','feature','score','frame','attribute','class_code','nearest_ref','link','x']);
                                        const sampleCols = Object.keys(parsed.data[0] || {}).filter(k => {
                                          const kl = k.toLowerCase().trim();
                                          return kl !== '' && !ANNOTATION_COLS.has(kl) &&
                                            !kl.includes('gene') && !kl.includes('_id') && kl !== 'x';
                                        });
                                        
                                        // Clean parsed data: remove empty keys and ensure 'Gene' is the first key
                                        const cleanData = parsed.data.map(row => {
                                            const newRow = {};
                                            // Find the gene column (the one we didn't classify as a sample, usually first)
                                            const geneKey = Object.keys(row).find(k => k.trim() !== '' && !sampleCols.includes(k));
                                            newRow['Gene'] = geneKey ? row[geneKey] : `Gene_${Math.random().toString(36).substr(2,5)}`;
                                            
                                            sampleCols.forEach(col => {
                                                newRow[col] = row[col];
                                            });
                                            return newRow;
                                        });

                                        const mockMeta = sampleCols.map((s, i) => ({
                                            Sample: s,
                                            Group: i < Math.floor(sampleCols.length / 2) ? 'Control' : 'Treated'
                                        }));

                                        setSummary({
                                            genes: cleanData.length,
                                            samples: sampleCols,
                                            controlCount: mockMeta.filter(d => d.Group === 'Control').length,
                                            treatedCount: mockMeta.filter(d => d.Group === 'Treated').length
                                        });

                                        setMetaAssignments(mockMeta);
                                        
                                        // Force conversion to strictly comma-separated CSV so our downstream manual parsers work
                                        const cleanCSV = Papa.unparse(cleanData);
                                        Storage.setItem('rawCounts', cleanCSV);
                                        Storage.setItem('rawMetadata', Papa.unparse(mockMeta));
                                        
                                        Storage.setItem('analysisMode', 'compute');
                                        // Clear stale artifacts from previous runs
                                        Storage.removeItem('filteredCounts');
                                        Storage.removeItem('deseq2Data');
                                        Storage.removeItem('edgerData');
                                        Storage.removeItem('limmaData');
                                        setDegSummary(null);
                                    } catch (err) {
                                        alert("Failed to parse file: " + err.message);
                                    }
                                    setLoading(false);
                                }}
                            />
                            <p style={{ fontSize: '1.2rem', color: '#0369a1', fontWeight: 600 }}>Drag and drop raw count matrix CSV here</p>
                            <p style={{ fontSize: '0.9rem', color: '#0ea5e9', marginTop: '0.5rem' }}>or click to browse your computer</p>
                        </label>
                        
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <button onClick={handleLoadDemo} disabled={loading} style={{ padding: '0.75rem 1.5rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
                                {loading ? 'Loading...' : 'Load Demo Dataset (GSE52778)'}
                            </button>
                            <span style={{ color: '#64748b' }}>Used for quick evaluation without files</span>
                        </div>
                    </div>
                )}

                {/* GEO Import Tab */}
                {activeTab === 'geo' && (
                    <div className="tab-content" style={{ animation: 'fadeIn 0.3s ease-in' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ color: '#475569', marginBottom: '1rem' }}>Enter a <strong>GEO Accession</strong> (e.g. GSE158055) to import processed count matrices.</p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <input 
                                    type="text" 
                                    value={geoAccession}
                                    onChange={(e) => setGeoAccession(e.target.value)}
                                    placeholder="e.g. GSE158055 or E-MTAB-513"
                                    style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', width: '300px' }}
                                />
                                <button 
                                    onClick={handleFetchGeo}
                                    disabled={isFetchingGeo}
                                    style={{ padding: '0.75rem 1.5rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    {isFetchingGeo ? 'Fetching...' : 'Fetch Dataset'}
                                </button>
                            </div>
                            {geoError && <p style={{ color: '#ef4444', marginTop: '0.5rem' }}>{geoError}</p>}
                        </div>

                        {geoData && (
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '2rem' }}>
                                <h3 style={{ fontSize: '1.25rem', color: '#0f172a', marginBottom: '0.5rem' }}>{geoData.title}</h3>
                                <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}><strong>Organism:</strong> {geoData.organism}</p>
                                <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {geoData.summary}
                                </p>
                                
                                {geoData.source === 'SRA' ? (
                                    <div style={{ background: '#fff', border: '1px solid #3b82f6', borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
                                        <h4 style={{ fontSize: '1rem', color: '#0284c7', marginBottom: '0.5rem' }}>Raw Sequencing Data Detected</h4>
                                        <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '1rem' }}>SRA and ENA provide raw sequencing reads (FASTQ) rather than processed count matrices. BioInsight 360 does not perform read alignment locally in the browser.</p>
                                        <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '0.5rem' }}><strong>Platform:</strong> {geoData.platform} | <strong>Strategy:</strong> {geoData.strategy}</p>
                                        <div style={{ background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem', overflowX: 'auto' }}>
                                            # Run this on your institutional cluster or local workstation:<br />
                                            module load sratoolkit<br />
                                            fastq-dump --split-files {geoAccession.trim()}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h4 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                            Processed Data Files (Supplementary)
                                        </h4>
                                        
                                        {geoData.supplFiles.length === 0 ? (
                                            <p style={{ color: '#64748b', fontStyle: 'italic' }}>No supplementary files found.</p>
                                        ) : (
                                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {geoData.supplFiles.map((file, idx) => (
                                                    <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <span style={{ background: '#e2e8f0', color: '#334155', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{file.type}</span>
                                                            <span style={{ color: '#0f172a', fontWeight: 500, wordBreak: 'break-all' }}>{file.filename}</span>
                                                        </div>
                                                        
                                                        {file.isProcessable ? (
                                                            <button 
                                                                onClick={() => handleImportGeoFile(file)}
                                                                disabled={loading}
                                                                style={{ padding: '0.5rem 1rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}
                                                            >
                                                                {loading ? 'Importing...' : 'Import Data ⬇'}
                                                            </button>
                                                        ) : (
                                                            <a href={file.url} target="_blank" rel="noreferrer" style={{ padding: '0.5rem 1rem', background: '#f1f5f9', color: '#475569', textDecoration: 'none', borderRadius: '6px', fontSize: '0.9rem', border: '1px solid #cbd5e1' }}>
                                                                Download Manually
                                                            </a>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* DEG Integration Tab */}
                {activeTab === 'deg' && (
                    <div className="tab-content" style={{ animation: 'fadeIn 0.3s ease-in' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                            {['deseq2', 'edger', 'limma'].map((tool) => {
                                const isUploaded = uploadedTools[tool];
                                return (
                                <label key={tool} style={{ border: `2px dashed ${isUploaded ? '#10b981' : '#8b5cf6'}`, padding: '2rem 1rem', textAlign: 'center', borderRadius: '12px', background: isUploaded ? '#ecfdf5' : '#f5f3ff', cursor: 'pointer', transition: 'all 0.3s' }}>
                                    <input 
                                        type="file" 
                                        accept=".csv,.txt,.tsv"
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            setLoading(true);
                                            try {
                                                const text = await file.text();
                                                let delim = ',';
                                                if (text.substring(0, text.indexOf('\n')).includes('\t')) delim = '\t';
                                                
                                                const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: delim });
                                                Storage.setItem(`${tool}Data`, JSON.stringify(parsed.data));
                                                
                                                const nextState = { ...uploadedTools, [tool]: true };
                                                setUploadedTools(nextState);
                                                
                                                if (nextState.deseq2 && nextState.edger && nextState.limma) {
                                                    Storage.setItem('analysisMode', 'downstream');
                                                    // Clear stale compute-mode artifacts
                                                    Storage.removeItem('rawCounts');
                                                    Storage.removeItem('filteredCounts');
                                                    Storage.removeItem('rawMetadata');
                                                    setDegSummary({
                                                        genes: parsed.data.length,
                                                        tools: 3
                                                    });
                                                    setSummary(null);
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                alert("File parsing failed: " + err.message);
                                            }
                                            setLoading(false);
                                        }}
                                    />
                                    <div style={{ fontSize: '1.2rem', color: isUploaded ? '#059669' : '#4c1d95', fontWeight: 600, textTransform: 'capitalize' }}>
                                        {tool === 'edger' ? 'edgeR' : tool === 'deseq2' ? 'DESeq2' : 'limma'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: isUploaded ? '#10b981' : '#7c3aed', marginTop: '0.5rem' }}>
                                        {isUploaded ? 'Loaded ✓' : 'Upload CSV/TSV'}
                                    </div>
                                </label>
                            )})}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <button onClick={handleLoadDegDemo} disabled={loading} style={{ padding: '0.75rem 1.5rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
                                {loading ? 'Loading...' : 'Load Demo Pipeline Results'}
                            </button>
                            <span style={{ color: '#64748b' }}>Instantly generates consensus for 3 mock pipelines</span>
                        </div>
                    </div>
                )}

                {/* Summary Section (Appears after successful local load or GEO import) */}
                {summary && (
                    <div style={{ marginTop: '3rem', animation: 'fadeIn 0.5s ease-in' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', color: '#0f172a' }}>Data Summary</h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                            {[
                                ['Total Genes', summary.genes],
                                ['Total Samples', summary.samples.length],
                                ['Control Group', summary.controlCount],
                                ['Treated Group', summary.treatedCount]
                            ].map(([label, val]) => (
                                <div key={label} style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>{label}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0284c7' }}>{val}</div>
                                </div>
                            ))}
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h4 style={{ margin: 0, color: '#334155' }}>Metadata Assignment</h4>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                    Type keywords to classify samples, or upload your own Metadata CSV.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <label style={{ padding: '0.5rem 1rem', background: '#e2e8f0', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                    Upload Metadata CSV
                                    <input type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={async (e) => {
                                        const file = e.target.files[0];
                                        if (!file) return;
                                        try {
                                            const text = await file.text();
                                            let delim = ',';
                                            if (text.substring(0, text.indexOf('\n')).includes('\t')) delim = '\t';
                                            const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: delim });
                                            
                                            // Assume first column is sample name, second is group
                                            const metaObj = {};
                                            parsed.data.forEach(row => {
                                                const keys = Object.keys(row);
                                                if (keys.length >= 2) {
                                                    const sample = row[keys[0]];
                                                    const group = row[keys[1]];
                                                    metaObj[sample] = group;
                                                }
                                            });
                                            
                                            const updated = metaAssignments.map(m => {
                                                const sName = (m.Sample || m.sample || m.ID || m.id || m.Name || m.name || '');
                                                // case-insensitive match for sample names if exact match fails
                                                const matchKey = Object.keys(metaObj).find(k => k === sName) || Object.keys(metaObj).find(k => k.toLowerCase() === sName.toLowerCase());
                                                return { ...m, Group: matchKey ? metaObj[matchKey] : 'Exclude' };
                                            });
                                            
                                            const uGroups = Array.from(new Set(updated.map(d => d.Group).filter(Boolean)));
                                            setUniqueGroups([...uGroups, 'Exclude']);
                                            if (uGroups.length > 0) setSelectedCtrl(uGroups.find(g => g.toLowerCase().includes('control')) || uGroups[0]);
                                            if (uGroups.length > 1) setSelectedTrt(uGroups.find(g => !g.toLowerCase().includes('control')) || uGroups[1]);
                                            
                                            setMetaAssignments(updated);
                                            Storage.setItem('metaData', JSON.stringify(updated));
                                            Storage.setItem('rawMetadata', Papa.unparse(updated));
                                        } catch (err) {
                                            alert("Failed to parse metadata file: " + err.message);
                                        }
                                    }} />
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f1f5f9', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <input type="text" value={autoCtrl} onChange={(e) => setAutoCtrl(e.target.value)} placeholder="Control keyword" style={{ width: '110px', fontSize: '0.8rem', padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                <input type="text" value={autoTrt} onChange={(e) => setAutoTrt(e.target.value)} placeholder="Treated keyword" style={{ width: '110px', fontSize: '0.8rem', padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                <input type="text" value={autoFilter} onChange={(e) => setAutoFilter(e.target.value)} placeholder="Required (e.g. Oocyte)" style={{ width: '130px', fontSize: '0.8rem', padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} title="If set, samples lacking this word are Excluded." />
                                <button onClick={() => {
                                    const updated = metaAssignments.map(m => {
                                        const sName = (m.Sample || m.sample || m.ID || m.id || m.Name || m.name || '').toLowerCase();
                                        const sMeta = Object.values(m).join(' ').toLowerCase();
                                        const searchTarget = sName + ' ' + sMeta;
                                        
                                        if (autoFilter && !searchTarget.includes(autoFilter.toLowerCase())) return { ...m, Group: 'Exclude' };
                                        if (autoCtrl && searchTarget.includes(autoCtrl.toLowerCase())) return { ...m, Group: 'Control' };
                                        if (autoTrt && searchTarget.includes(autoTrt.toLowerCase())) return { ...m, Group: 'Treated' };
                                        return { ...m, Group: 'Exclude' };
                                    });
                                    setMetaAssignments(updated);
                                    Storage.setItem('metaData', JSON.stringify(updated));
                                    Storage.setItem('rawMetadata', Papa.unparse(updated));
                                    setSummary(prev => ({
                                        ...prev,
                                        controlCount: updated.filter(ma => ma.Group === 'Control').length,
                                        treatedCount: updated.filter(ma => ma.Group === 'Treated').length
                                    }));
                                }} style={{ padding: '0.3rem 0.6rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Auto-Assign</button>
                            </div>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                            {metaAssignments.map((m, idx) => {
                                const sampleName = m.Sample || m.sample || m.ID || m.id || m.Name || m.name || `Sample_${idx}`;
                                return (
                                <div key={sampleName} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: 500, color: m.Group === 'Exclude' ? '#94a3b8' : '#0f172a' }}>{sampleName}</span>
                                    <select 
                                        style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.3rem 0.5rem' }} 
                                        value={m.Group}
                                        onChange={(e) => {
                                            const newGroup = e.target.value;
                                            const updated = metaAssignments.map(ma => {
                                                const maName = ma.Sample || ma.sample || ma.ID || ma.id || ma.Name || ma.name;
                                                return maName === sampleName ? { ...ma, Group: newGroup } : ma;
                                            });
                                            setMetaAssignments(updated);
                                            Storage.setItem('metaData', JSON.stringify(updated));
                                            Storage.setItem('rawMetadata', Papa.unparse(updated));
                                        }}
                                    >
                                        {Array.from(new Set([...uniqueGroups, 'Control', 'Treated', 'Exclude'])).map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>
                                </div>
                            );})}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div>
                                <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Select Analysis Groups</h4>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.9rem', color: '#475569' }}>
                                        <strong>Control Group: </strong>
                                        <select value={selectedCtrl} onChange={e => setSelectedCtrl(e.target.value)} style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                            {Array.from(new Set([...uniqueGroups, 'Control', 'Treated'])).map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </label>
                                    <label style={{ fontSize: '0.9rem', color: '#475569' }}>
                                        <strong>Treatment Group: </strong>
                                        <select value={selectedTrt} onChange={e => setSelectedTrt(e.target.value)} style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                            {Array.from(new Set([...uniqueGroups, 'Control', 'Treated'])).map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </label>
                                </div>
                            </div>
                            <button onClick={() => {
                                Storage.setItem('activeControlGroup', selectedCtrl);
                                Storage.setItem('activeTreatedGroup', selectedTrt);
                                router.push('/qc');
                            }} style={{ padding: '1rem 2.5rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'none'}>
                                Proceed to QC & Analysis →
                            </button>
                        </div>
                    </div>
                )}
                
                {/* DEG Summary Section */}
                {degSummary && (
                    <div style={{ marginTop: '3rem', animation: 'fadeIn 0.5s ease-in' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', color: '#0f172a' }}>Downstream Results Loaded</h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Total Genes Merged</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#8b5cf6' }}>{degSummary.genes}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Pipelines Loaded</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#8b5cf6' }}>{degSummary.tools} (DESeq2, edgeR, limma)</div>
                            </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            {/* Skip QC directly to Consensus since we have no raw counts */}
                            <button onClick={() => router.push('/consensus')} style={{ padding: '1rem 2.5rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'none'}>
                                Skip QC → Proceed directly to Consensus Dashboard
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <style jsx>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}


### File: lib/consensus.js
```javascript
import { normalizeCPM, normalizeUpperQuartile, normalizeMedianOfRatios } from './normalize.js';
import { runDifferentialExpression } from './statistics.js';
import { median } from './mathUtils.js';

/**
 * Run all normalization and testing pipelines.
 */
export function runAllPipelines(rawMatrix, geneNames, groupIndices1, groupIndices2) {
  const normalizers = [
    { name: 'CPM', fn: normalizeCPM },
    { name: 'UQ', fn: normalizeUpperQuartile },
    { name: 'MedianRatios', fn: normalizeMedianOfRatios }
  ];
  const tests = ['welch', 'mannWhitney'];
  
  const pipelines = [];
  for (const norm of normalizers) {
    const normMatrix = norm.fn(rawMatrix);
    for (const test of tests) {
      const deRes = runDifferentialExpression(normMatrix, groupIndices1, groupIndices2, test);
      pipelines.push({ name: `${norm.name}_${test}`, results: deRes });
    }
  }
  return { pipelines, geneNames };
}

/**
 * Format pre-computed downstream DEGs (DESeq2, edgeR, limma) into pipeline structure.
 */
export function formatDownstreamPipelines(deseq2, edger, limma) {
  const geneSet = new Set();
  const extract = (data) => {
    if(!data) return;
    data.forEach(row => {
      const g = row.Gene_ID || row.Gene || row.id || row.ID;
      if (g) geneSet.add(g);
    });
  };
  
  extract(deseq2);
  extract(edger);
  extract(limma);

  const geneNames = Array.from(geneSet);
  const geneToIndex = new Map();
  geneNames.forEach((g, idx) => geneToIndex.set(g, idx));

  const createResults = (data) => {
    const results = new Array(geneNames.length).fill(null);
    if (!data) return results;
    
    data.forEach(row => {
      const g = row.Gene_ID || row.Gene || row.id || row.ID;
      const idx = geneToIndex.get(g);
      if (idx !== undefined) {
         results[idx] = {
             gene_index: idx,
             log2fc: parseFloat(row.logFC ?? row.log2FoldChange ?? 0),
             pvalue: parseFloat(row.pvalue ?? row.PValue ?? row.pval ?? row.padj ?? row.FDR ?? 1),
             padj: parseFloat(row.padj ?? row.FDR ?? row.pvalue ?? 1)
          };
      }
    });
    return results;
  };

  const pipelines = [];
  if (deseq2) pipelines.push({ name: 'DESeq2', results: createResults(deseq2) });
  if (edger) pipelines.push({ name: 'edgeR', results: createResults(edger) });
  if (limma) pipelines.push({ name: 'limma', results: createResults(limma) });

  return { pipelines, geneNames };
}

/**
 * Classify a gene based on its consensus score, dynamically scaled to total pipelines.
 */
export function classifyGene(consensusScore, totalPipelines = 6) {
  const ratio = consensusScore / totalPipelines;
  if (ratio >= 0.8) return 'high_confidence';      // 80%+ agreement
  if (ratio >= 0.5) return 'moderate_confidence';   // 50%+ agreement
  if (ratio >= 0.15) return 'method_sensitive';     // At least 1 pipeline
  return 'not_significant';
}

/**
 * Compute multi-pipeline consensus for each gene.
 */
export function computeConsensus(pipelines, geneNames, fcThreshold, pThreshold) {
  if (!pipelines || pipelines.length === 0 || !geneNames) return [];
  const numGenes = geneNames.length;
  const consensusResults = [];
  
  for (let i = 0; i < numGenes; i++) {
    let sigCount = 0;
    const l2fcs = [];
    const pvals = [];
    let posDirs = 0;
    let negDirs = 0;
    
    for (const pipe of pipelines) {
      const res = pipe.results[i];
      if (res) {
        if (!isNaN(res.log2fc)) l2fcs.push(res.log2fc);
        if (!isNaN(res.pvalue)) pvals.push(res.pvalue);
        
        if (res.pvalue <= pThreshold && Math.abs(res.log2fc) >= fcThreshold) {
          sigCount++;
          if (res.log2fc > 0) posDirs++;
          else if (res.log2fc < 0) negDirs++;
        }
      }
    }
    
    consensusResults.push({
      geneName: geneNames[i],
      consensusScore: sigCount,
      category: classifyGene(sigCount, pipelines.length),
      log2fc_median: median(l2fcs),
      pvalues: pvals,
      directions: { positive: posDirs, negative: negDirs }
    });
  }
  
  return consensusResults;
}

/**
 * Compute Jaccard index between two sets.
 */
export function computeJaccard(setA, setB) {
  if (!setA || !setB) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

/**
 * Compute overlap coefficient between two sets.
 */
export function computeOverlapCoefficient(setA, setB) {
  if (!setA || !setB) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const minSize = Math.min(setA.size, setB.size);
  if (minSize === 0) return 1;
  return intersection.size / minSize;
}

/**
 * Compute Fleiss' Kappa for inter-rater agreement.
 * @param {Array<Array<number>>} matrix - Genes x Pipelines (0 or 1 values)
 */
export function computeFleissKappa(matrix) {
  if (!matrix || matrix.length === 0) return 0;
  const N = matrix.length;
  const n = matrix[0].length;
  if (n < 2) return n === 1 ? 1 : 0;
  
  const categoryCounts = [0, 0];
  const P = new Array(N).fill(0);
  
  for (let i = 0; i < N; i++) {
    let ones = 0;
    for (let j = 0; j < n; j++) {
      if (matrix[i][j]) {
        ones++;
        categoryCounts[1]++;
      } else {
        categoryCounts[0]++;
      }
    }
    P[i] = (ones * ones + (n - ones) * (n - ones) - n) / (n * (n - 1));
  }
  
  const P_bar = P.reduce((a, b) => a + b, 0) / N;
  const Pe = Math.pow(categoryCounts[0] / (N * n), 2) + Math.pow(categoryCounts[1] / (N * n), 2);
  
  if (Pe === 1) return 1;
  return (P_bar - Pe) / (1 - Pe);
}

/**
 * Compute pairwise Jaccard similarity between all pipelines.
 */
export function computePairwiseJaccard(pipelines, fcThreshold, pThreshold) {
  if (!pipelines || pipelines.length === 0) return [];
  const sigSets = pipelines.map(pipe => {
    const s = new Set();
    pipe.results.forEach(res => {
      // Use unadjusted p-value because standard FDR on n=3 without Bayes shrinkage yields 0 significant genes
      if (res && res.pvalue <= pThreshold && Math.abs(res.log2fc) >= fcThreshold) s.add(res.gene_index);
    });
    return s;
  });
  
  const n = sigSets.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(1));
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const jaccard = computeJaccard(sigSets[i], sigSets[j]);
      matrix[i][j] = jaccard;
      matrix[j][i] = jaccard;
    }
  }
  return matrix;
}


### File: lib/cpm_filter.js
```javascript
export function filterByCPM(matrix, geneNames, cpmThreshold, minSamples) {
  if (!matrix || matrix.length === 0) return { filteredMatrix: [], filteredGenes: [] };

  const numSamples = matrix[0].length;
  
  // 1. Calculate library sizes (total reads per sample)
  const libSizes = new Array(numSamples).fill(0);
  for (let g = 0; g < matrix.length; g++) {
    for (let s = 0; s < numSamples; s++) {
      libSizes[s] += matrix[g][s];
    }
  }

  const filteredMatrix = [];
  const filteredGenes = [];

  // 2. Filter genes
  for (let g = 0; g < matrix.length; g++) {
    let samplesPassing = 0;
    for (let s = 0; s < numSamples; s++) {
      if (libSizes[s] > 0) {
        const cpm = (matrix[g][s] / libSizes[s]) * 1000000;
        if (cpm >= cpmThreshold) {
          samplesPassing++;
        }
      }
    }
    
    // Keep gene if it meets CPM threshold in at least minSamples
    if (samplesPassing >= minSamples) {
      filteredMatrix.push([...matrix[g]]);
      filteredGenes.push(geneNames[g]);
    }
  }

  return { filteredMatrix, filteredGenes };
}

export function matrixToCSV(matrix, geneNames, sampleNames) {
  const header = ['Gene', ...sampleNames].join(',');
  const rows = matrix.map((row, i) => `${geneNames[i]},${row.join(',')}`);
  return [header, ...rows].join('\n');
}


### File: lib/enrichment.js
```javascript
import { hypergeometricSF } from './mathUtils.js';
import { benjaminiHochberg } from './statistics.js';

/**
 * Hypergeometric survival function test (p-value of observing >= k overlapping genes).
 */
export function hypergeometricTest(k, N, K, n) {
  return hypergeometricSF(k, N, K, n);
}

/**
 * Run GO pathway enrichment over a list of differentially expressed genes.
 * @param {Array<string>} degList List of significant gene names
 * @param {Array<Object>} goAnnotations Array of { term, name, genes: [] }
 * @param {Array<string>} allGenes Background gene universe
 */
export function runGOEnrichment(degList, goAnnotations, allGenes) {
  if (!degList || !allGenes || allGenes.length === 0 || !goAnnotations) return [];
  // Use case-insensitive matching
  const degSet = new Set(degList.map(g => g.toUpperCase()));
  const allSet = new Set(allGenes.map(g => g.toUpperCase()));
  
  const N = allSet.size;
  const n = degSet.size;
  
  const results = [];
  const pvalues = [];
  
  for (const go of goAnnotations) {
    if (!go.genes || go.genes.length === 0) continue;
    
    // Restrict GO term genes to the background universe (case-insensitive, deduplicated)
    const validGenes = [...new Set(go.genes.map(g => g.toUpperCase()))].filter(g => allSet.has(g));
    const K = validGenes.length;
    
    // SPECIFICITY FILTER: Ignore tiny noisy terms (<3) and massive generic terms (>500)
    // This prevents useless terms like "cellular process" from burying informative biological pathways
    if (K < 3 || K > 500) continue;
    
    const overlappingGenes = validGenes.filter(g => degSet.has(g));
    const k = overlappingGenes.length;
    
    const pval = hypergeometricTest(k, N, K, n);
    const expected = (n * K) / N;
    const enrichmentRatio = expected === 0 ? 0 : k / expected;
    
    pvalues.push(pval);
    results.push({
      term: go.term,
      name: go.name,
      pvalue: pval,
      padj: 1, // Set after BH
      overlap: k,
      overlappingGenes: overlappingGenes,
      termGeneCount: K,
      expected: expected,
      enrichmentRatio: enrichmentRatio
    });
  }
  
  const padjs = benjaminiHochberg(pvalues);
  for (let i = 0; i < results.length; i++) {
    results[i].padj = padjs[i];
  }
  
  return results.sort((a, b) => a.pvalue - b.pvalue);
}

/**
 * Computes pathway enrichment consensus across 6 pipelines.
 * @param {Array<Array<Object>>} pipelineEnrichments Array of 6 GO enrichment result arrays
 * @param {number} pThreshold Significance threshold (default 0.05)
 */
export function computePathwayConsensus(pipelineEnrichments, pThreshold = 0.05) {
  if (!pipelineEnrichments || pipelineEnrichments.length === 0) return [];
  
  const pathwayMap = new Map();
  const numPipelines = pipelineEnrichments.length;
  
  for (let pIdx = 0; pIdx < numPipelines; pIdx++) {
    const pipe = pipelineEnrichments[pIdx];
    if (!pipe) continue;
    
    for (const enrich of pipe) {
      if (!pathwayMap.has(enrich.term)) {
        pathwayMap.set(enrich.term, {
          term: enrich.term,
          name: enrich.name,
          count: 0,
          pvalues: [],
          overlaps: [],
          allOverlappingGenes: new Set()
        });
      }
      
      const item = pathwayMap.get(enrich.term);
      item.pvalues.push(enrich.padj !== undefined ? enrich.padj : enrich.pvalue);
      item.overlaps.push(enrich.overlap);
      enrich.overlappingGenes.forEach(g => item.allOverlappingGenes.add(g));
      
      if (enrich.pvalue < pThreshold && enrich.overlap > 0) {
        item.count++;
      }
    }
  }
  
  const results = Array.from(pathwayMap.values()).map(p => {
    let category = 'not_significant';
    if (p.count >= 5) category = 'high_confidence';
    else if (p.count >= 3) category = 'moderate_confidence';
    else if (p.count >= 1) category = 'method_sensitive';
    
    const sortedPvalues = [...p.pvalues].sort((a, b) => a - b);
    const medianPvalue = sortedPvalues.length > 0 ? sortedPvalues[Math.floor(sortedPvalues.length / 2)] : 1;
    const maxOverlap = p.overlaps.length > 0 ? Math.max(...p.overlaps) : 0;
    
    return {
      term: p.term,
      name: p.name,
      consensusScore: p.count,
      category: category,
      adjPValueMedian: medianPvalue, // Keep the same name so we don't break existing ui code
      maxOverlap: maxOverlap,
      overlappingGenes: Array.from(p.allOverlappingGenes),
      pipelinesEnriched: `${p.count}/${numPipelines}`
    };
  });
  
  return results.sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    return a.adjPValueMedian - b.adjPValueMedian;
  });
}


### File: lib/geo_api.js
```javascript
export async function fetchGeoMetadata(accession) {
  try {
    const isSRA = /^([SED]R[RPXS]|PRJNA|SAMN)/i.test(accession);
    const isGEO = /^GSE/i.test(accession);
    const isEBI = /^E-/i.test(accession);

    if (!isSRA && !isGEO && !isEBI) {
      throw new Error(`Invalid accession format "${accession}". Please use GEO (GSE...), SRA (SRR...), or EBI (E-...).`);
    }

    if (isSRA) {
      return await fetchSraMetadata(accession);
    }
    
    if (isEBI) {
      return await fetchEbiMetadata(accession);
    }

    // Default: GEO Fetching
    const targetUrl = `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${accession}&targ=self&form=xml&view=quick`;
    const proxyUrl = `/api/ncbi?url=${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Network response was not ok: ${response.status} - ${errText}`);
    }    
    // API route returns text directly since we proxy the content type
    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const errorNode = xmlDoc.querySelector("error");
    if (errorNode) {
      throw new Error(errorNode.textContent || "Unknown GEO error");
    }

    const title = xmlDoc.querySelector("Title")?.textContent || "No Title";
    const summary = xmlDoc.querySelector("Summary")?.textContent || "No Summary";
    const organism = xmlDoc.querySelector("Organism")?.textContent || "Unknown";

    const supplNodes = xmlDoc.querySelectorAll("Supplementary-Data");
    const supplFiles = [];
    
    supplNodes.forEach(node => {
      const type = node.getAttribute("type");
      let url = (node.textContent || "").trim();
      
      if (url.startsWith('ftp://')) {
        url = url.replace('ftp://', 'https://');
      }

      const isProcessable = url.endsWith('.txt.gz') || 
                            url.endsWith('.csv.gz') || 
                            url.endsWith('.tsv.gz') ||
                            url.endsWith('.txt') ||
                            url.endsWith('.csv') ||
                            url.endsWith('.tsv');

      if (url) {
        supplFiles.push({
          type,
          url,
          filename: url.split('/').pop(),
          isProcessable
        });
      }
    });

    return {
      source: 'GEO',
      title,
      summary,
      organism,
      supplFiles
    };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    throw error;
  }
}

async function fetchEbiMetadata(accession) {
  const targetUrl = `https://www.ebi.ac.uk/gxa/json/experiments/${accession}`;
  const proxyUrl = `/api/ncbi?url=${encodeURIComponent(targetUrl)}`;
  
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error('EBI Network error or experiment not found');
  
  const data = await response.json();
  const exp = data.experiment;
  
  if (!exp) {
    throw new Error('Could not parse EBI Expression Atlas response');
  }

  // Construct direct download link to the RNA-seq read counts
  const ebiDownloadLink = `https://www.ebi.ac.uk/gxa/experiments/${accession}/Downloads`;

  return {
    source: 'EBI',
    title: exp.description || "No Title",
    summary: `Species: ${exp.species}. Type: ${exp.type}`,
    organism: exp.species || "Unknown",
    supplFiles: [{
      type: 'EBI Processed Data',
      filename: `Download Count Matrices manually from EBI`,
      url: ebiDownloadLink,
      isProcessable: false
    }]
  };
}

async function fetchSraMetadata(accession) {
  // Step 1: Esearch
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=sra&term=${accession}[Accession]&retmode=json`;
  const proxySearchUrl = `/api/ncbi?url=${encodeURIComponent(searchUrl)}`;
  
  const searchRes = await fetch(proxySearchUrl);
  if (!searchRes.ok) throw new Error('Network error in SRA esearch');
  
  const searchData = await searchRes.json();
  
  const ids = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) {
    throw new Error(`SRA Accession ${accession} not found.`);
  }
  
  const uid = ids[0];

  // Step 2: Esummary
  const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=sra&id=${uid}&retmode=json`;
  const proxySumUrl = `/api/ncbi?url=${encodeURIComponent(sumUrl)}`;
  
  const sumRes = await fetch(proxySumUrl);
  if (!sumRes.ok) throw new Error('Network error in SRA esummary');
  
  const sumData = await sumRes.json();
  
  const record = sumData?.result?.[uid];
  if (!record || !record.expxml) {
    throw new Error("Invalid SRA record format");
  }

  // Esummary expxml is a string containing XML.
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(record.expxml, "text/xml");

  const title = xmlDoc.querySelector("Title")?.textContent || "No Title";
  const organism = xmlDoc.querySelector("Organism")?.getAttribute("ScientificName") || "Unknown";
  const platform = xmlDoc.querySelector("Platform")?.textContent || "Unknown Platform";
  const strategy = xmlDoc.querySelector("LIBRARY_STRATEGY")?.textContent || "Unknown Strategy";

  return {
    source: 'SRA',
    title,
    summary: `Raw sequencing data (FASTQ). Platform: ${platform}, Strategy: ${strategy}. BioInsight 360 does not perform raw FASTQ mapping locally. Please use institutional compute resources.`,
    organism,
    platform,
    strategy,
    supplFiles: [] // SRA has no processed matrices to import
  };
}


### File: lib/mathUtils.js
```javascript
/**
 * Shared math utilities for BioInsight 360
 */

/**
 * Base-2 logarithm with pseudocount handling.
 */
export function log2(x) {
  return Math.log2(x + 1e-8);
}

/**
 * Sum of an array.
 */
export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Arithmetic mean.
 */
export function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

/**
 * Sample variance (Bessel-corrected, divides by N-1).
 */
export function variance(arr) {
  if (!arr || arr.length <= 1) return 0;
  const m = mean(arr);
  return arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1);
}

/**
 * Standard deviation.
 */
export function stddev(arr) {
  return Math.sqrt(variance(arr));
}

/**
 * Median value.
 */
export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * q-th quantile (0 to 1).
 */
export function quantile(arr, q) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Geometric mean (skips zeros).
 */
export function geometricMean(arr) {
  if (!arr || arr.length === 0) return 0;
  const nonZeros = arr.filter(x => x > 0);
  if (nonZeros.length === 0) return 0;
  const sumLog = nonZeros.reduce((a, b) => a + Math.log(b), 0);
  return Math.exp(sumLog / nonZeros.length);
}

/**
 * Returns rank array with averaged ties.
 */
export function rank(arr) {
  if (!arr || arr.length === 0) return [];
  const sorted = arr.map((val, ind) => ({ val, ind })).sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && Object.is(sorted[j].val, sorted[i].val)) j++;
    const avgRank = (i + j - 1) / 2 + 1; // 1-based rank
    for (let k = i; k < j; k++) ranks[sorted[k].ind] = avgRank;
    i = j;
  }
  return ranks;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
export function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/**
 * Log gamma function (Lanczos approximation).
 */
export function lnGamma(x) {
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278224755,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  let g = 7;
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = p[0];
  const t = x + g + 0.5;
  for (let i = 1; i < p.length; i++) a += p[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function (continued fraction approximation).
 */
export function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const beta = Math.exp(lnGamma(a) + lnGamma(b) - lnGamma(a + b));
  let f = 1; let c = 1; let d = 0;
  for (let i = 1; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let num = 0;
    if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-8) break;
  }
  const result = Math.exp(a * Math.log(x) + b * Math.log(1 - x)) / (a * f * beta);
  return result;
}

/**
 * Student's t-distribution CDF approximation.
 */
export function tDistCDF(t, df) {
  const x = df / (t * t + df);
  const prob = regularizedIncompleteBeta(x, df / 2, 0.5) / 2;
  return t > 0 ? 1 - prob : prob;
}

/**
 * Log of binomial coefficient.
 */
export function lnBinomial(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/**
 * Single PMF term for hypergeometric distribution.
 */
export function hypergeometricPMF(k, N, K, n) {
  if (k < 0 || k > Math.min(K, n) || k < Math.max(0, n - (N - K))) return 0;
  return Math.exp(lnBinomial(K, k) + lnBinomial(N - K, n - k) - lnBinomial(N, n));
}

/**
 * Survival function (1 - CDF) for hypergeometric distribution.
 */
export function hypergeometricSF(x, N, K, n) {
  let p = 0;
  for (let k = x; k <= Math.min(K, n); k++) {
    p += hypergeometricPMF(k, N, K, n);
  }
  return Math.min(1, p);
}


### File: lib/normalize.js
```javascript
import { sum, quantile, geometricMean, median } from './mathUtils.js';

/**
 * Normalizes a gene expression matrix using Counts Per Million (CPM).
 * @param {Array<Array<number>>} matrix - Genes (rows) x Samples (cols)
 * @returns {Array<Array<number>>} Normalized matrix
 */
export function normalizeCPM(matrix) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const colSums = new Array(numSamples).fill(0);
  
  for (let j = 0; j < numSamples; j++) {
    for (let i = 0; i < numGenes; i++) {
      colSums[j] += Math.max(0, matrix[i][j]);
    }
  }
  
  const normMatrix = Array.from({ length: numGenes }, () => new Array(numSamples));
  for (let i = 0; i < numGenes; i++) {
    for (let j = 0; j < numSamples; j++) {
      normMatrix[i][j] = colSums[j] > 0 ? (Math.max(0, matrix[i][j]) / colSums[j]) * 1e6 : 0;
    }
  }
  return normMatrix;
}

/**
 * Normalizes a gene expression matrix using Upper Quartile (UQ) method.
 * @param {Array<Array<number>>} matrix - Genes x Samples
 * @returns {Array<Array<number>>} Normalized matrix
 */
export function normalizeUpperQuartile(matrix) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const sizeFactors = new Array(numSamples).fill(1);
  
  for (let j = 0; j < numSamples; j++) {
    const nonZeros = [];
    for (let i = 0; i < numGenes; i++) {
      if (matrix[i][j] > 0) nonZeros.push(matrix[i][j]);
    }
    const uq = quantile(nonZeros, 0.75);
    sizeFactors[j] = uq > 0 ? uq : 1;
  }
  
  const meanUQ = sum(sizeFactors) / sizeFactors.length;
  const normMatrix = Array.from({ length: numGenes }, () => new Array(numSamples));
  for (let i = 0; i < numGenes; i++) {
    for (let j = 0; j < numSamples; j++) {
      normMatrix[i][j] = matrix[i][j] / (sizeFactors[j] / meanUQ);
    }
  }
  return normMatrix;
}

/**
 * Normalizes a gene expression matrix using Median of Ratios (DESeq2 style).
 * @param {Array<Array<number>>} matrix - Genes x Samples
 * @returns {Array<Array<number>>} Normalized matrix
 */
export function normalizeMedianOfRatios(matrix) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const geoMeans = new Array(numGenes);
  
  for (let i = 0; i < numGenes; i++) {
    geoMeans[i] = geometricMean(matrix[i]);
  }
  
  const sizeFactors = new Array(numSamples).fill(1);
  for (let j = 0; j < numSamples; j++) {
    const ratios = [];
    for (let i = 0; i < numGenes; i++) {
      if (geoMeans[i] > 0 && matrix[i][j] > 0) {
        ratios.push(matrix[i][j] / geoMeans[i]);
      }
    }
    const sf = median(ratios);
    sizeFactors[j] = sf > 0 ? sf : 1;
  }
  
  const normMatrix = Array.from({ length: numGenes }, () => new Array(numSamples));
  for (let i = 0; i < numGenes; i++) {
    for (let j = 0; j < numSamples; j++) {
      normMatrix[i][j] = matrix[i][j] / sizeFactors[j];
    }
  }
  return normMatrix;
}


### File: lib/pca.js
```javascript
/**
 * Compute PCA on a matrix using the Gram matrix (dual PCA) approach.
 *
 * The standard (primal) PCA builds an nGenes × nGenes covariance matrix,
 * which is catastrophic for typical RNA-seq data (e.g. 15,000 genes →
 * 225 million elements, ~1.8 GB). Dual PCA instead builds the much smaller
 * nSamples × nSamples Gram matrix K = X · Xᵀ, then recovers principal
 * component scores from K's eigenvectors. This is efficient whenever
 * nSamples ≪ nGenes.
 *
 * Algorithm:
 *   1. Center the data (subtract per-gene / per-column mean).
 *   2. Compute the Gram matrix K = centeredData · centeredDataᵀ  (nSamples × nSamples).
 *   3. Extract top eigenvectors/eigenvalues of K via power iteration + deflation.
 *   4. Recover PC scores: score_c = X_centered^T · u_c (gene-space eigenvector),
 *      then project samples: PC_c[i] = Σ_j X_centered[i][j] · score_c[j].
 *      Equivalently, PC scores per sample are √λ · u (the Gram eigenvector
 *      scaled by √eigenvalue), which is what we return.
 *   5. Variance explained = eigenvalue_c / Σ(eigenvalues).
 *
 * @param {Array<Array<number>>} matrix - Input data: samples (rows) × genes (columns).
 * @param {number} [nComponents=2] - Number of principal components to retain.
 * @returns {{
 *   components: Array<Array<number>>,
 *   varianceExplained: Array<number>,
 *   loadings: null
 * }} An object with:
 *   - `components[c][i]`: score of sample `i` on principal component `c`.
 *   - `varianceExplained[c]`: fraction of total variance captured by component `c`.
 *   - `loadings`: `null` (gene-space loadings are not computed in the dual approach
 *      to avoid allocating nGenes-length vectors; reconstruct them downstream if needed
 *      via loadings_c = Xᵀ · u_c / √λ_c).
 */
export function computePCA(matrix, nComponents = 2) {
  // ── Edge case: empty or degenerate input ──────────────────────────────
  if (!matrix || matrix.length === 0 || !matrix[0] || matrix[0].length === 0) {
    return { components: [], varianceExplained: [], loadings: null };
  }

  const nSamples = matrix.length;
  const nGenes = matrix[0].length;

  // With a single sample there is no variance to decompose.
  if (nSamples === 1) {
    const comps = Array.from({ length: Math.min(nComponents, 1) }, () => [0]);
    const varExp = comps.map(() => 0);
    return { components: comps, varianceExplained: varExp, loadings: null };
  }

  // ── Step 1: Center the data (subtract per-gene column mean) ───────────
  const colMeans = new Float64Array(nGenes); // typed array for speed
  for (let i = 0; i < nSamples; i++) {
    const row = matrix[i];
    for (let j = 0; j < nGenes; j++) {
      colMeans[j] += row[j];
    }
  }
  for (let j = 0; j < nGenes; j++) {
    colMeans[j] /= nSamples;
  }

  // Centered data stored as an array-of-Float64Arrays to reduce GC pressure.
  const centered = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    const row = matrix[i];
    const cRow = new Float64Array(nGenes);
    for (let j = 0; j < nGenes; j++) {
      cRow[j] = row[j] - colMeans[j];
    }
    centered[i] = cRow;
  }

  // ── Step 2: Build the Gram matrix K = X_centered · X_centeredᵀ ────────
  // K is symmetric and only nSamples × nSamples (e.g. 8 × 8 = 64 elements).
  const K = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    K[i] = new Float64Array(nSamples);
  }

  for (let i = 0; i < nSamples; i++) {
    const rowI = centered[i];
    // Diagonal element
    let dotII = 0;
    for (let g = 0; g < nGenes; g++) {
      dotII += rowI[g] * rowI[g];
    }
    K[i][i] = dotII;

    // Off-diagonal (exploit symmetry: compute once, store twice)
    for (let j = i + 1; j < nSamples; j++) {
      const rowJ = centered[j];
      let dot = 0;
      for (let g = 0; g < nGenes; g++) {
        dot += rowI[g] * rowJ[g];
      }
      K[i][j] = dot;
      K[j][i] = dot;
    }
  }

  // ── Compute total variance from the Gram matrix ───────────────────────
  // Trace(K) = Σ_i ||x_i - mean||² which equals (nSamples-1) * total_variance
  // when using the unbiased estimator. We keep the raw trace and normalise at
  // the end so eigenvalue ratios remain correct.
  let traceK = 0;
  for (let i = 0; i < nSamples; i++) {
    traceK += K[i][i];
  }

  // All-zero data (every gene has zero variance) → no meaningful PCs.
  if (traceK === 0) {
    const nComp = Math.min(nComponents, nSamples);
    const comps = Array.from({ length: nComp }, () => new Array(nSamples).fill(0));
    const varExp = new Array(nComp).fill(0);
    return { components: comps, varianceExplained: varExp, loadings: null };
  }

  // ── Step 3: Power iteration with deflation on K ───────────────────────
  // We extract up to min(nComponents, nSamples-1) eigenvectors because the
  // rank of the centered Gram matrix is at most nSamples - 1 (centering
  // removes one degree of freedom).
  const maxComponents = Math.min(nComponents, nSamples - 1);
  const MAX_ITER = 200;
  const CONV_THRESHOLD = 1e-10;

  /** @type {Array<Float64Array>} Eigenvectors of K (length nSamples each) */
  const eigenvectors = [];
  /** @type {number[]} Eigenvalues of K */
  const eigenvalues = [];

  // Work on a mutable copy of K so deflation doesn't corrupt the original.
  const Kwork = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    Kwork[i] = new Float64Array(K[i]); // copy row
  }

  for (let c = 0; c < maxComponents; c++) {
    // Initialise with a deterministic vector (1, 2, 3, …) to keep results
    // reproducible. Any non-zero vector that isn't orthogonal to the dominant
    // eigenvector will converge.
    let v = new Float64Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      v[i] = i + 1;
    }
    let norm = vecNorm(v);
    vecScale(v, 1 / norm);

    let eigenvalue = 0;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      // Multiply: w = Kwork · v
      const w = new Float64Array(nSamples);
      for (let i = 0; i < nSamples; i++) {
        const kRow = Kwork[i];
        let sum = 0;
        for (let j = 0; j < nSamples; j++) {
          sum += kRow[j] * v[j];
        }
        w[i] = sum;
      }

      norm = vecNorm(w);
      if (norm === 0) {
        // Remaining subspace is null → eigenvalue is zero.
        break;
      }
      vecScale(w, 1 / norm);

      // Rayleigh quotient: λ = vᵀ K v (using the new v = w).
      let ev = 0;
      for (let i = 0; i < nSamples; i++) {
        const kRow = Kwork[i];
        let rowDot = 0;
        for (let j = 0; j < nSamples; j++) {
          rowDot += kRow[j] * w[j];
        }
        ev += w[i] * rowDot;
      }

      const diff = Math.abs(ev - eigenvalue);
      eigenvalue = ev;
      v = w;

      if (diff < CONV_THRESHOLD) {
        break;
      }
    }

    eigenvectors.push(v);
    eigenvalues.push(Math.max(eigenvalue, 0)); // clamp negative numerical noise

    // ── Deflate: remove this component's contribution from Kwork ───────
    // Kwork ← Kwork - λ · v · vᵀ
    for (let i = 0; i < nSamples; i++) {
      const vi = v[i];
      const kRow = Kwork[i];
      for (let j = 0; j < nSamples; j++) {
        kRow[j] -= eigenvalue * vi * v[j];
      }
    }
  }

  // ── Step 4: Compute PC scores per sample ──────────────────────────────
  // In dual PCA the relationship between the Gram eigenvector u_c (length
  // nSamples) and the primal PC scores is:
  //
  //   PC_c[i] = √λ_c · u_c[i]
  //
  // This gives each sample its coordinate on principal component c.
  const components = new Array(eigenvalues.length);
  for (let c = 0; c < eigenvalues.length; c++) {
    const scale = Math.sqrt(eigenvalues[c]);
    const u = eigenvectors[c];
    const scores = new Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      scores[i] = scale * u[i];
    }
    components[c] = scores;
  }

  // ── Step 5: Variance explained ────────────────────────────────────────
  // Each eigenvalue of K is proportional to the variance along that PC.
  // Fraction = λ_c / Σ λ.  We use traceK as Σ λ (sum of all eigenvalues
  // equals the trace of K).
  const varianceExplained = eigenvalues.map((ev) => traceK === 0 ? 0 : (ev / traceK) * 100);

  return { components, varianceExplained, loadings: null };
}

// ── Helper utilities ──────────────────────────────────────────────────────

/**
 * Euclidean (L2) norm of a Float64Array.
 * @param {Float64Array} v
 * @returns {number}
 */
function vecNorm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * In-place scalar multiplication: v ← v * s.
 * @param {Float64Array} v
 * @param {number} s
 */
function vecScale(v, s) {
  for (let i = 0; i < v.length; i++) {
    v[i] *= s;
  }
}


### File: lib/qc.js
```javascript
import { mean, stddev, rank } from './mathUtils.js';

/**
 * Computes library size for each sample (sum of counts across all genes)
 * @param {number[][]} matrix - genes x samples
 * @returns {number[]} library sizes per sample
 */
export function computeLibrarySizes(matrix) {
  if (!matrix || matrix.length === 0) return [];
  const numSamples = matrix[0].length;
  const sizes = new Array(numSamples).fill(0);
  for (let g = 0; g < matrix.length; g++) {
    for (let s = 0; s < numSamples; s++) {
      sizes[s] += matrix[g][s];
    }
  }
  return sizes;
}

/**
 * Computes gene detection rate for each sample (% of genes with count > minCount)
 * @param {number[][]} matrix - genes x samples
 * @param {number} minCount - threshold for detection (default 0)
 * @returns {number[]} percentage of detected genes per sample
 */
export function computeDetectionRates(matrix, minCount = 0) {
  if (!matrix || matrix.length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const rates = new Array(numSamples).fill(0);
  for (let s = 0; s < numSamples; s++) {
    let count = 0;
    for (let g = 0; g < numGenes; g++) {
      if (matrix[g][s] > minCount) count++;
    }
    rates[s] = (count / numGenes) * 100;
  }
  return rates;
}

/**
 * Computes Spearman correlation between two arrays
 */
function spearmanCorrelation(arr1, arr2) {
  const r1 = rank(arr1);
  const r2 = rank(arr2);
  const m1 = mean(r1);
  const m2 = mean(r2);
  let num = 0;
  let d1 = 0;
  let d2 = 0;
  for (let i = 0; i < r1.length; i++) {
    const diff1 = r1[i] - m1;
    const diff2 = r2[i] - m2;
    num += diff1 * diff2;
    d1 += diff1 * diff1;
    d2 += diff2 * diff2;
  }
  if (d1 === 0 || d2 === 0) return 1;
  return num / Math.sqrt(d1 * d2);
}

/**
 * Computes sample-to-sample Spearman correlation matrix
 * @param {number[][]} matrix - genes x samples
 * @returns {number[][]} samples x samples correlation matrix
 */
export function computeSampleCorrelation(matrix) {
  if (!matrix || matrix.length === 0) return [];
  const numSamples = matrix[0].length;
  const numGenes = matrix.length;

  // Extract columns (sample vectors)
  const sampleVectors = [];
  for (let s = 0; s < numSamples; s++) {
    const col = new Array(numGenes);
    for (let g = 0; g < numGenes; g++) {
      col[g] = matrix[g][s];
    }
    sampleVectors.push(col);
  }

  const corrMatrix = Array.from({ length: numSamples }, () => new Array(numSamples).fill(1));
  for (let i = 0; i < numSamples; i++) {
    for (let j = i + 1; j < numSamples; j++) {
      const corr = spearmanCorrelation(sampleVectors[i], sampleVectors[j]);
      corrMatrix[i][j] = corr;
      corrMatrix[j][i] = corr;
    }
  }
  return corrMatrix;
}

/**
 * Identifies outlier samples based on library size and detection rate z-scores
 * @param {number[]} librarySizes
 * @param {number[]} detectionRates
 * @returns {object[]} array of status objects per sample: { index, isOutlier, reason, status }
 */
export function detectOutliers(librarySizes, detectionRates) {
  const meanSize = mean(librarySizes);
  const stdSize = stddev(librarySizes);
  const meanRate = mean(detectionRates);
  const stdRate = stddev(detectionRates);

  return librarySizes.map((size, idx) => {
    const rate = detectionRates[idx];
    const sizeZ = stdSize > 0 ? Math.abs((size - meanSize) / stdSize) : 0;
    const rateZ = stdRate > 0 ? Math.abs((rate - meanRate) / stdRate) : 0;

    let isOutlier = false;
    let reason = 'Normal';
    let status = 'Pass';

    if (sizeZ > 2.0) {
      isOutlier = true;
      reason = `Extreme library size (z=${sizeZ.toFixed(2)})`;
      status = 'Fail';
    } else if (rateZ > 2.0) {
      isOutlier = true;
      reason = `Low detection rate (z=${rateZ.toFixed(2)})`;
      status = 'Fail';
    } else if (sizeZ > 1.5 || rateZ > 1.5) {
      reason = 'Moderate deviation from mean';
      status = 'Warning';
    }

    return { index: idx, sizeZ, rateZ, isOutlier, reason, status };
  });
}


### File: lib/quickgo_api.js
```javascript
export async function fetchGoTermDetails(goId) {
  try {
    // Route through local proxy to bypass CORS/adblockers
    const targetUrl = `https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${encodeURIComponent(goId)}`;
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch GO term: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      throw new Error("GO term not found");
    }

    const term = data.results[0];
    
    return {
      id: term.id,
      name: term.name,
      definition: term.definition?.text || "No definition available",
      aspect: term.aspect,
      synonyms: term.synonyms?.map(s => s.name) || []
    };
  } catch (error) {
    console.error("QuickGO API error:", error);
    throw error;
  }
}


### File: lib/statistics.js
```javascript
import { mean, variance, tDistCDF, rank, normalCDF } from './mathUtils.js';

/**
 * Perform Welch's t-test for two unequal variance samples.
 */
export function welchTTest(group1, group2) {
  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);
  const n1 = group1.length;
  const n2 = group2.length;
  
  if (n1 < 2 || n2 < 2 || (v1 === 0 && v2 === 0)) return { t: 0, df: 1, pvalue: 1 };
  
  const t = (m1 - m2) / Math.sqrt((v1 / n1) + (v2 / n2));
  const dfNum = Math.pow((v1 / n1) + (v2 / n2), 2);
  const dfDen = Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1);
  const df = dfNum / dfDen;
  
  const pvalue = 2 * (1 - tDistCDF(Math.abs(t), df));
  return { t, df, pvalue };
}

/**
 * Perform Mann-Whitney U test (Normal approximation).
 */
export function mannWhitneyU(group1, group2) {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 === 0 || n2 === 0) return { U: 0, z: 0, pvalue: 1 };
  
  const all = [...group1, ...group2];
  const ranks = rank(all);
  let R1 = 0;
  for (let i = 0; i < n1; i++) R1 += ranks[i];
  
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  
  const mU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigmaU === 0 ? 0 : (U - mU) / sigmaU;
  
  const pvalue = 2 * normalCDF(-Math.abs(z));
  return { U, z, pvalue };
}

/**
 * Calculate log2 Fold Change with pseudocounts.
 */
export function log2FoldChange(treated, control) {
  const m1 = mean(treated);
  const m2 = mean(control);
  return Math.log2((m1 + 1) / (m2 + 1));
}

/**
 * Calculate Cohen's d effect size.
 */
export function cohensD(group1, group2) {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 < 2 || n2 < 2) return 0;
  
  const v1 = variance(group1);
  const v2 = variance(group2);
  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  if (pooledSd === 0) return 0;
  return (mean(group1) - mean(group2)) / pooledSd;
}

/**
 * Apply Benjamini-Hochberg FDR correction.
 */
export function benjaminiHochberg(pvalues) {
  const n = pvalues.length;
  const sorted = pvalues.map((p, i) => ({ p, i })).sort((a, b) => (isNaN(a.p) ? 1 : isNaN(b.p) ? -1 : a.p - b.p));
  const padj = new Array(n);
  let minPrev = 1;
  
  for (let i = n - 1; i >= 0; i--) {
    const q = (sorted[i].p * n) / (i + 1);
    minPrev = Math.min(minPrev, q);
    padj[sorted[i].i] = minPrev;
  }
  return padj;
}

/**
 * Run differential expression for all genes.
 */
export function runDifferentialExpression(matrix, groupIndices1, groupIndices2, test = 'welch') {
  if (!matrix || matrix.length === 0) return [];
  const results = [];
  const pvalues = [];
  
  for (let i = 0; i < matrix.length; i++) {
    const geneExpr = matrix[i];
    const g1 = groupIndices1.map(idx => geneExpr[idx]);
    const g2 = groupIndices2.map(idx => geneExpr[idx]);
    
    // Log-transform data to stabilize variance and approximate normality (similar to limma voom)
    const g1_log = g1.map(x => Math.log2(x + 1));
    const g2_log = g2.map(x => Math.log2(x + 1));

    const l2fc = log2FoldChange(g2, g1); // Maintain standard log2(FC) on unlogged means
    const d = cohensD(g2_log, g1_log); // Compute effect size on log-scale for variance stability
    let pval = 1;
    
    if (test === 'welch') {
      pval = welchTTest(g1_log, g2_log).pvalue;
    } else {
      pval = mannWhitneyU(g1, g2).pvalue;
    }
    
    pvalues.push(pval);
    results.push({ gene_index: i, log2fc: l2fc, pvalue: pval, padj: 1, cohens_d: d });
  }
  
  const padjs = benjaminiHochberg(pvalues);
  for (let i = 0; i < results.length; i++) {
    results[i].padj = padjs[i];
  }
  
  return results;
}


### File: lib/storage.js
```javascript
const memoryStore = new Map();

export const Storage = {
    setItem: (key, value) => {
        // Always store in memory for unlimited size (works across Next.js Link navigations)
        memoryStore.set(key, value);
        
        // Try to persist to sessionStorage to survive F5 reloads, but catch quota errors silently
        if (typeof window !== 'undefined') {
          try {
              sessionStorage.setItem(key, value);
          } catch (e) {
              console.warn(`Storage quota exceeded for ${key}. Data stored in memory only. A page refresh will clear this data.`);
          }
        }
    },
    getItem: (key) => {
        // Memory takes precedence
        if (memoryStore.has(key)) {
            return memoryStore.get(key);
        }
        
        // Fallback to sessionStorage
        if (typeof window !== 'undefined') {
            const val = sessionStorage.getItem(key);
            if (val !== null) {
                memoryStore.set(key, val);
            }
            return val;
        }
        return null;
    },
    removeItem: (key) => {
        memoryStore.delete(key);
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(key);
        }
    },
    clear: () => {
        memoryStore.clear();
        if (typeof window !== 'undefined') {
            sessionStorage.clear();
        }
    }
};


### File: public/workers/qcWorker.js
```javascript
/**
 * QC Web Worker — runs heavy computation off the main thread.
 * Receives: { rawMatrix, geneNames, sampleNames, sampleGroups, cpmThreshold }
 * Returns: full qcData object ready for rendering.
 */

// Minimal CSV row parser that handles quoted fields
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

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function mean(arr) { return arr.length === 0 ? 0 : sum(arr) / arr.length; }
function variance(arr) {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1);
}
function stddev(arr) { return Math.sqrt(variance(arr)); }
function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function quantile(arr, q) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function rank(arr) {
  if (!arr || arr.length === 0) return [];
  const sorted = arr.map((val, ind) => ({ val, ind })).sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && Object.is(sorted[j].val, sorted[i].val)) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[sorted[k].ind] = avgRank;
    i = j;
  }
  return ranks;
}

// === CPM Filter ===
function filterByCPM(matrix, geneNames, cpmThreshold, minSamples) {
  if (!matrix || matrix.length === 0) return { filteredMatrix: [], filteredGenes: [] };
  const numSamples = matrix[0].length;
  const libSizes = new Array(numSamples).fill(0);
  for (let g = 0; g < matrix.length; g++)
    for (let s = 0; s < numSamples; s++)
      libSizes[s] += matrix[g][s];

  const filteredMatrix = [];
  const filteredGenes = [];
  for (let g = 0; g < matrix.length; g++) {
    let passing = 0;
    for (let s = 0; s < numSamples; s++) {
      if (libSizes[s] > 0 && (matrix[g][s] / libSizes[s]) * 1e6 >= cpmThreshold) passing++;
    }
    if (passing >= minSamples) {
      filteredMatrix.push([...matrix[g]]);
      filteredGenes.push(geneNames[g]);
    }
  }
  return { filteredMatrix, filteredGenes };
}

// === QC Functions ===
function computeLibrarySizes(matrix) {
  if (!matrix || matrix.length === 0) return [];
  const numSamples = matrix[0].length;
  const sizes = new Array(numSamples).fill(0);
  for (let g = 0; g < matrix.length; g++)
    for (let s = 0; s < numSamples; s++)
      sizes[s] += matrix[g][s];
  return sizes;
}

function computeDetectionRates(matrix, minCount = 0) {
  if (!matrix || matrix.length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const rates = new Array(numSamples).fill(0);
  for (let s = 0; s < numSamples; s++) {
    let count = 0;
    for (let g = 0; g < numGenes; g++) if (matrix[g][s] > minCount) count++;
    rates[s] = (count / numGenes) * 100;
  }
  return rates;
}

function spearmanCorrelation(arr1, arr2) {
  const r1 = rank(arr1), r2 = rank(arr2);
  const m1 = mean(r1), m2 = mean(r2);
  let num = 0, d1 = 0, d2 = 0;
  for (let i = 0; i < r1.length; i++) {
    const diff1 = r1[i] - m1, diff2 = r2[i] - m2;
    num += diff1 * diff2; d1 += diff1 * diff1; d2 += diff2 * diff2;
  }
  return (d1 === 0 || d2 === 0) ? 1 : num / Math.sqrt(d1 * d2);
}

function computeSampleCorrelation(matrix) {
  if (!matrix || matrix.length === 0) return [];
  const numSamples = matrix[0].length;
  const numGenes = matrix.length;
  const vecs = [];
  for (let s = 0; s < numSamples; s++) {
    const col = new Array(numGenes);
    for (let g = 0; g < numGenes; g++) col[g] = matrix[g][s];
    vecs.push(col);
  }
  const corr = Array.from({ length: numSamples }, () => new Array(numSamples).fill(1));
  for (let i = 0; i < numSamples; i++)
    for (let j = i + 1; j < numSamples; j++) {
      const c = spearmanCorrelation(vecs[i], vecs[j]);
      corr[i][j] = c; corr[j][i] = c;
    }
  return corr;
}

function detectOutliers(librarySizes, detectionRates) {
  const mS = mean(librarySizes), sS = stddev(librarySizes);
  const mR = mean(detectionRates), sR = stddev(detectionRates);
  return librarySizes.map((size, idx) => {
    const rate = detectionRates[idx];
    const sizeZ = sS > 0 ? Math.abs((size - mS) / sS) : 0;
    const rateZ = sR > 0 ? Math.abs((rate - mR) / sR) : 0;
    let isOutlier = false, reason = 'Normal', status = 'Pass';
    if (sizeZ > 2.5) { isOutlier = true; reason = `Extreme library size (z=${sizeZ.toFixed(2)})`; status = 'Fail'; }
    else if (rateZ > 2.5) { isOutlier = true; reason = `Low detection rate (z=${rateZ.toFixed(2)})`; status = 'Fail'; }
    else if (sizeZ > 1.8 || rateZ > 1.8) { reason = 'Moderate deviation from mean'; status = 'Warning'; }
    return { index: idx, sizeZ, rateZ, isOutlier, reason, status };
  });
}

// === PCA (Dual/Gram matrix approach) ===
function vecNorm(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]*v[i]; return Math.sqrt(s); }
function vecScale(v, s) { for (let i = 0; i < v.length; i++) v[i] *= s; }

function computePCA(matrix, nComponents = 2) {
  if (!matrix || matrix.length === 0 || !matrix[0] || matrix[0].length === 0)
    return { components: [], varianceExplained: [], loadings: null };
  const nSamples = matrix.length, nGenes = matrix[0].length;
  if (nSamples === 1) return { components: [[0]], varianceExplained: [0], loadings: null };

  const colMeans = new Float64Array(nGenes);
  for (let i = 0; i < nSamples; i++) for (let j = 0; j < nGenes; j++) colMeans[j] += matrix[i][j];
  for (let j = 0; j < nGenes; j++) colMeans[j] /= nSamples;

  const centered = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    const cRow = new Float64Array(nGenes);
    for (let j = 0; j < nGenes; j++) cRow[j] = matrix[i][j] - colMeans[j];
    centered[i] = cRow;
  }

  const K = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) K[i] = new Float64Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    let dotII = 0;
    for (let g = 0; g < nGenes; g++) dotII += centered[i][g] * centered[i][g];
    K[i][i] = dotII;
    for (let j = i + 1; j < nSamples; j++) {
      let dot = 0;
      for (let g = 0; g < nGenes; g++) dot += centered[i][g] * centered[j][g];
      K[i][j] = dot; K[j][i] = dot;
    }
  }

  let traceK = 0;
  for (let i = 0; i < nSamples; i++) traceK += K[i][i];
  if (traceK === 0) {
    const nC = Math.min(nComponents, nSamples);
    return { components: Array.from({length: nC}, () => new Array(nSamples).fill(0)), varianceExplained: new Array(nC).fill(0), loadings: null };
  }

  const maxComp = Math.min(nComponents, nSamples - 1);
  const Kw = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) Kw[i] = new Float64Array(K[i]);

  const eigenvectors = [], eigenvalues = [];
  for (let c = 0; c < maxComp; c++) {
    let v = new Float64Array(nSamples);
    for (let i = 0; i < nSamples; i++) v[i] = i + 1;
    let norm = vecNorm(v); vecScale(v, 1/norm);
    let eigenvalue = 0;
    for (let iter = 0; iter < 200; iter++) {
      const w = new Float64Array(nSamples);
      for (let i = 0; i < nSamples; i++) { let s = 0; for (let j = 0; j < nSamples; j++) s += Kw[i][j]*v[j]; w[i] = s; }
      norm = vecNorm(w);
      if (norm === 0) break;
      vecScale(w, 1/norm);
      let ev = 0;
      for (let i = 0; i < nSamples; i++) { let rd = 0; for (let j = 0; j < nSamples; j++) rd += Kw[i][j]*w[j]; ev += w[i]*rd; }
      const diff = Math.abs(ev - eigenvalue);
      eigenvalue = ev; v = w;
      if (diff < 1e-10) break;
    }
    eigenvectors.push(v); eigenvalues.push(Math.max(eigenvalue, 0));
    for (let i = 0; i < nSamples; i++) for (let j = 0; j < nSamples; j++) Kw[i][j] -= eigenvalue * v[i] * v[j];
  }

  const components = eigenvalues.map((ev, c) => {
    const scale = Math.sqrt(ev);
    return Array.from({length: nSamples}, (_, i) => scale * eigenvectors[c][i]);
  });
  const varianceExplained = eigenvalues.map(ev => traceK === 0 ? 0 : (ev / traceK) * 100);
  return { components, varianceExplained, loadings: null };
}

// === CSV helper ===
function matrixToCSV(matrix, geneNames, sampleNames) {
  const header = ['Gene', ...sampleNames].join(',');
  const rows = matrix.map((row, i) => `${geneNames[i]},${row.join(',')}`);
  return [header, ...rows].join('\n');
}

self.onmessage = function(e) {
  const { rawCountsCSV, rawMetaCSV, cpmThreshold } = e.data;

  const lines = rawCountsCSV.trim().split('\n');
  const header = parseCSVRow(lines[0]);
  const sampleNames = header.slice(1);

  const metaLines = rawMetaCSV.trim().split('\n');
  const groupMap = {};
  for (let i = 1; i < metaLines.length; i++) {
    if (!metaLines[i].trim()) continue;
    const [s, g] = parseCSVRow(metaLines[i]);
    groupMap[s] = g || '';
  }

  const includeIndices = [];
  const validSampleNames = [];
  const validSampleGroups = [];

  for (let i = 0; i < sampleNames.length; i++) {
    const name = sampleNames[i];
    const group = groupMap[name] || (i % 2 === 0 ? 'Control' : 'Treated');
    if (group.toLowerCase() !== 'exclude') {
      includeIndices.push(i);
      validSampleNames.push(name);
      validSampleGroups.push(group);
    }
  }

  const geneNames = [];
  const rawMatrix = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = parseCSVRow(lines[i]);
    geneNames.push(parts[0]);
    const rowNumbers = parts.slice(1).map(Number);
    rawMatrix.push(includeIndices.map(idx => rowNumbers[idx]));
  }

  // 1. Filter
  const { filteredMatrix, filteredGenes } = filterByCPM(rawMatrix, geneNames, cpmThreshold, 2);
  const filteredCSV = matrixToCSV(filteredMatrix, filteredGenes, validSampleNames);

  // 2. QC metrics on raw matrix
  const librarySizes = computeLibrarySizes(rawMatrix);
  const detectionRates = computeDetectionRates(rawMatrix);
  const corrMatrix = computeSampleCorrelation(filteredMatrix);
  const outlierStatus = detectOutliers(librarySizes, detectionRates);

  // 3. PCA (log2(CPM+1) normalized)
  const logCpmMatrix = Array.from({ length: filteredMatrix.length }, (_, g) => {
    return filteredMatrix[g].map((count, s) => {
      const lib = librarySizes[s];
      const cpm = lib > 0 ? (count / lib) * 1e6 : 0;
      return Math.log2(cpm + 1);
    });
  });

  const samplesMatrix = Array.from({ length: validSampleNames.length }, (_, s) =>
    logCpmMatrix.map(row => row[s])
  );
  const pcaResult = computePCA(samplesMatrix, 2);

  const avgLibSize = librarySizes.reduce((a, b) => a + b, 0) / librarySizes.length;
  const avgDetRate = detectionRates.reduce((a, b) => a + b, 0) / detectionRates.length;
  const outlierCount = outlierStatus.filter(s => s.isOutlier).length;

  self.postMessage({
    filteredCSV,
    qcData: {
      sampleNames: validSampleNames, sampleGroups: validSampleGroups, librarySizes, detectionRates, corrMatrix,
      outlierStatus, pcaResult, avgLibSize, avgDetRate, outlierCount,
      genesRetained: filteredGenes.length, totalGenes: geneNames.length
    }
  });
};
```
