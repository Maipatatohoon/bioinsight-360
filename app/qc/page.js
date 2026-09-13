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
  const [cpmThreshold, setCpmThreshold] = useState(1.0);
  const [rawState, setRawState] = useState(null);

  useEffect(() => {
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

        const worker = new Worker('/workers/qcWorker.js');
        
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
          cpmThreshold
        });

      } catch (err) {
        console.error('Error loading data:', err);
        setLoading(false);
      }
    }
    loadInitialData();
  }, [router, cpmThreshold]);

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
                zmin: 0.8,
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
