'use client';
import { Storage } from '../../lib/storage';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import PCAScatter from '../../components/PCAScatter';
import { computeLibrarySizes, computeDetectionRates, computeSampleCorrelation, detectOutliers } from '../../lib/qc';
import { computePCA } from '../../lib/pca';
import { motion } from 'framer-motion';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function QCPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [qcData, setQcData] = useState(null);
  const [jobState, setJobState] = useState('QUEUED');
  const [jobProgress, setJobProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState('Initializing...');
  const [jobError, setJobError] = useState(null);

  const [cpmThreshold, setCpmThreshold] = useState(() => {
    return parseFloat(Storage.getItem('cpmThreshold') || '1.0');
  });
  const [debouncedCpm, setDebouncedCpm] = useState(() => {
    return parseFloat(Storage.getItem('cpmThreshold') || '1.0');
  });

  // Debounce: only re-run Worker 500ms after user stops dragging
  // Note: Backend handles QC now, so CPM threshold here is just for display/future filtering
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCpm(cpmThreshold);
      Storage.setItem('cpmThreshold', String(cpmThreshold));
    }, 500);
    return () => clearTimeout(t);
  }, [cpmThreshold]);

  useEffect(() => {
    let isMounted = true;
    let pollInterval;

    async function pollJob() {
      try {
        const jobId = Storage.getItem('currentJobId');
        if (!jobId) {
          router.replace('/upload');
          return;
        }

        const { getJobStatus } = await import('../../lib/backend_api');
        
        const status = await getJobStatus(jobId);
        
        if (!isMounted) return;

        setJobState(status.state);
        setJobProgress(status.progress);
        setJobMessage(status.message);

        if (status.qc_data) {
          setQcData(status.qc_data);
          setLoading(false);
        }

        if (status.state === 'FAILED') {
          console.error("Job failed:", status.error);
          setJobError(status.error || 'The analysis job failed.');
          clearInterval(pollInterval);
        } else if (status.state === 'COMPLETED') {
          clearInterval(pollInterval);
          // Completed but no QC payload: stop spinning and explain instead.
          if (!status.qc_data) {
            setJobError('The job finished but returned no QC data.');
          }
        }
        
      } catch (err) {
        console.error('Error polling job status:', err);
        setJobError(err.message || 'Could not reach the analysis backend.');
      }
    }

    if (Storage.getItem('analysisMode') === 'downstream') {
      router.replace('/consensus');
    } else {
      pollJob();
      pollInterval = setInterval(pollJob, 2000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [router]);

  if (jobError && !qcData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#0f172a', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: '#b91c1c', marginBottom: '0.5rem' }}>Analysis failed</h2>
        <p style={{ color: '#334155', maxWidth: '640px', marginBottom: '1.5rem' }}>{jobError}</p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => window.location.reload()} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#0284c7', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
            Retry
          </button>
          <button onClick={() => router.push('/upload')} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}>
            Back to upload
          </button>
        </div>
      </div>
    );
  }

  if (loading || !qcData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#0f172a' }}>
        <div className="pulse" style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
        <h2 style={{ color: '#0284c7', marginBottom: '0.5rem' }}>{jobMessage}</h2>
        <div style={{ width: '300px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginTop: '1rem' }}>
          <div style={{ height: '100%', width: `${jobProgress}%`, background: '#0284c7', transition: 'width 0.5s ease-in-out' }}></div>
        </div>
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

  const isCompleted = jobState === 'COMPLETED';

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
          <span className="page-eyebrow">Quality Control</span>
          <h1 className="page-title">
            Quality Control Dashboard
          </h1>
          <p style={{ color: '#1e293b', fontSize: '1rem', marginTop: '0.5rem' }}>
            Exploratory Data Analysis: Library sizes, PCA, Spearman correlations & outlier detection
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <button 
            onClick={() => isCompleted && router.push(`/consensus?jobId=${Storage.getItem('currentJobId')}`)}
            className={isCompleted ? "btn-primary" : "btn-disabled"}
            disabled={!isCompleted}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', 
              fontSize: '1rem', fontWeight: 'bold',
              background: isCompleted ? undefined : '#cbd5e1',
              cursor: isCompleted ? 'pointer' : 'not-allowed',
              opacity: isCompleted ? 1 : 0.7
            }}
          >
            {isCompleted ? 'Proceed to Consensus Analysis →' : 'Analysis in Progress...'}
          </button>
          {!isCompleted && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid #64748b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              {jobMessage} ({jobProgress}%)
            </div>
          )}
        </div>
      </div>

      {/* Low-Expression Gene Filter (CPM) */}
      <motion.div 
        className="glass-card" 
        initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
        style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '3rem', alignItems: 'center' }}
      >
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
      </motion.div>

      {/* Stat Cards */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}
      >
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
      </motion.div>

      {/* QC Visualizations Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}
      >
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
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
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
        <motion.div 
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, duration: 0.6 }}
          className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}
        >
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
                  <th>Avg Corr (r)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sampleNames.map((name, idx) => {
                  const stat = outlierStatus[idx] || { status: 'Pass', avgCorr: 1, reason: 'Normal' };
                  const isPass = stat.status === 'Pass';
                  const isWarn = stat.status === 'Warning';
                  const avgCorr = stat.avgCorr !== undefined ? stat.avgCorr.toFixed(3) : 'N/A';

                  return (
                    <tr key={name}>
                      <td style={{ fontWeight: 'bold', color: '#0284c7' }}>{name}</td>
                      <td>{sampleGroups[idx]}</td>
                      <td style={{ fontFamily: 'monospace' }}>{(librarySizes[idx] / 1e6).toFixed(2)}M</td>
                      <td style={{ fontFamily: 'monospace' }}>{detectionRates[idx].toFixed(1)}%</td>
                      <td style={{ fontFamily: 'monospace' }}>{avgCorr}</td>
                      <td>
                        <span
                          className={isPass ? 'badge-high' : isWarn ? 'badge-moderate' : 'badge-sensitive'}
                          title={stat.reason}
                          style={{ cursor: 'help' }}
                        >
                          {stat.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
