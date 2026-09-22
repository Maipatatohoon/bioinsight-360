'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PathwayChart from '../../components/PathwayChart';
import { runAllPipelines, formatDownstreamPipelines } from '../../lib/consensus';
import { fetchGoTermDetails } from '../../lib/quickgo_api';
import { runGProfilerEnrichment } from '../../lib/gprofiler_api';
import { computePathwayConsensus } from '../../lib/enrichment';
import { motion } from 'framer-motion';

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
  const [fetchError, setFetchError] = useState(null);
  const [pathwayConsensus, setPathwayConsensus] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedPathway, setSelectedPathway] = useState(null);
  const [selectedPathwayDetails, setSelectedPathwayDetails] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  
  // Explicit Organism Handling as requested
  const [organism, setOrganism] = useState('hsapiens');

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
        setFetchError(null);
        const mode = Storage.getItem('analysisMode') || 'compute';
        let pipelineData;

        if (mode === 'downstream') {
          const deseq2 = JSON.parse(Storage.getItem('deseq2Data'));
          const edger = JSON.parse(Storage.getItem('edgerData'));
          const limma = JSON.parse(Storage.getItem('limmaData'));
          pipelineData = formatDownstreamPipelines(deseq2, edger, limma);
        } else {
          const cachedData = Storage.getItem('pipelineData');
          if (cachedData) {
            try {
              pipelineData = JSON.parse(cachedData);
            } catch(e) {
              console.error('Failed to parse cached pipeline data', e);
            }
          }
          if (!pipelineData) {
            console.error("No cached pipeline data found. Redirecting to consensus.");
            router.replace('/consensus');
            return;
          }
        }

        // Read thresholds set by user on Consensus page (fall back to sensible defaults)
        const userFc = parseFloat(Storage.getItem('consensusFcThreshold') || '1.0');
        const userPval = parseFloat(Storage.getItem('consensusPvalThreshold') || '0.05');

        // Background universe = only genes measured in the experiment
        const experimentUniverse = pipelineData.geneNames;

        console.log(`[BioInsight] Explicit organism: ${organism}, Input Genes: ${experimentUniverse.length}`);

        // Compute DEGs per pipeline and run g:Profiler for each
        const pipelineEnrichments = await Promise.all(pipelineData.pipelines.map(async pipe => {
          const degs = pipe.results
            .filter(r => r && Math.abs(r.log2fc) >= userFc && r.padj <= userPval)
            .map((r, i) => pipelineData.geneNames[r.gene_index !== undefined ? r.gene_index : i])
            .filter(Boolean);
          
          if (degs.length === 0) return [];
          return await runGProfilerEnrichment(degs, experimentUniverse, organism);
        }));

        // Compute Pathway Consensus — use a more lenient pThreshold for small gene sets
        const consensus = computePathwayConsensus(pipelineEnrichments, 0.2);
        setPathwayConsensus(consensus);
        if (consensus.length > 0) {
          setSelectedPathway(consensus[0]);
        }
      } catch (err) {
        console.error('Error computing pathway consensus:', err);
        setFetchError(err.message || "An error occurred while computing pathway consensus.");
      } finally {
        setLoading(false);
      }
    }

    loadAndComputePathways();
  }, [organism]);

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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', maxWidth: '1400px', margin: '0 auto' }}
    >
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
          <p style={{ color: '#1e293b' }}>Fetching real-time annotations from EBI QuickGO & evaluating hypergeometric enrichment across pipelines</p>
        </div>
      ) : fetchError ? (
        <div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(254, 226, 226, 0.5)', borderRadius: '12px', border: '1px solid #fca5a5' }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>⚠️ Computation Failed</h2>
          <p style={{ color: '#7f1d1d' }}>{fetchError}</p>
          <button onClick={() => window.location.reload()} className="btn-secondary" style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', fontWeight: 'bold' }}>Retry Analysis</button>
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
    </motion.div>
  );
}
