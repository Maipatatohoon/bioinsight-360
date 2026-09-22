'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { fetchGeoMetadata } from '../../lib/geo_api';
import { motion } from 'framer-motion';

export function processCountMatrix(rawText) {
    if (!rawText || !rawText.trim()) {
        throw new Error("Count matrix file is empty.");
    }
    let text = rawText.trim();

    // Extract GEO Series Matrix Table if present
    if (text.includes('!series_matrix_table_begin')) {
        const beginIdx = text.indexOf('!series_matrix_table_begin');
        let tableText = text.substring(beginIdx + '!series_matrix_table_begin'.length);
        if (tableText.includes('!series_matrix_table_end')) {
            tableText = tableText.substring(0, tableText.indexOf('!series_matrix_table_end'));
        }
        text = tableText.trim();
    }

    const firstLineEnd = text.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? text : text.substring(0, firstLineEnd);

    // Detect delimiter
    let delim = ',';
    if (firstLine.includes('\t')) delim = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delim = ';';

    // Handle missing top-left header for row names (common R write.csv / write.table)
    if (text.startsWith(',') || text.startsWith('\t') || text.startsWith(';')) {
        text = 'Gene' + text;
    } else {
        const preview = Papa.parse(text.split('\n').slice(0, 3).join('\n'), { skipEmptyLines: true, delimiter: delim });
        if (preview.data && preview.data.length >= 2) {
            if (preview.data[0].length === preview.data[1].length - 1) {
                text = 'Gene' + delim + text;
            }
        }
    }

    let parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: delim });
    if (!parsed.data || parsed.data.length === 0) {
        throw new Error("Could not parse file or file is empty.");
    }

    // Fallback: If only 1 column was detected, the file might be space-aligned
    if (Object.keys(parsed.data[0] || {}).length === 1 && !firstLine.includes(',')) {
        const spaceNormalized = text.replace(/[ \t]+/g, '\t');
        const parsedSpace = Papa.parse(spaceNormalized, { header: true, skipEmptyLines: true, delimiter: '\t' });
        if (parsedSpace.data && parsedSpace.data.length > 0 && Object.keys(parsedSpace.data[0] || {}).length > 1) {
            parsed = parsedSpace;
        }
    }

    const firstRow = parsed.data[0] || {};
    const allCols = Object.keys(firstRow);
    if (allCols.length === 0) {
        throw new Error("No columns detected in count matrix.");
    }

    // Annotation columns common in featureCounts/HTSeq/STAR output — never sample count columns
    const ANNOTATION_COLS = new Set([
        'chr', 'chrom', 'chromosome', 'start', 'end', 'strand', 'length', 'width',
        'biotype', 'gene_biotype', 'gene_type', 'exon_id', 'protein_id', 'havana_gene',
        'havana_transcript', 'description', 'source', 'feature', 'score', 'frame',
        'attribute', 'class_code', 'nearest_ref', 'link'
    ]);

    // Robust gene column detection:
    // Matches 'gene', 'symbol', 'gene_name', 'id', 'probe', 'ensembl', empty string "", or "x"
    const GENE_ID_REGEX = /^(gene|gene_?id|gene_?name|symbol|gene_?symbol|id|probe|probeset|ensembl|ensembl_?id|target_?id|name)$/i;
    let geneColKey = allCols.find(k => {
        const kl = k.toLowerCase().trim();
        return GENE_ID_REGEX.test(kl) || kl === '' || kl === 'x';
    });

    if (!geneColKey && allCols.length > 0) {
        geneColKey = allCols[0];
    }

    // Sample columns are all remaining columns that are not the gene column, not annotations, not empty
    const sampleCols = allCols.filter(k => {
        if (k === geneColKey) return false;
        const kl = k.toLowerCase().trim();
        return kl !== '' && !ANNOTATION_COLS.has(kl);
    });

    if (sampleCols.length === 0) {
        throw new Error("No sample columns detected in count matrix.");
    }

    // Clean data: ensure 'Gene' is the first key and preserve original gene identifiers
    const cleanData = parsed.data.map((row, rowIdx) => {
        const newRow = {};
        const rawGene = row[geneColKey];
        const geneVal = (rawGene !== undefined && rawGene !== null && String(rawGene).trim() !== '')
            ? String(rawGene).trim()
            : `Gene_${rowIdx + 1}`;
        newRow['Gene'] = geneVal;
        sampleCols.forEach(col => {
            const val = Number(row[col]);
            newRow[col] = !isNaN(val) ? val : (row[col] ?? 0);
        });
        return newRow;
    });

    return { cleanData, sampleCols };
}

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

    useEffect(() => {
        Storage.setItem('activeControlGroup', selectedCtrl);
        Storage.setItem('activeTreatedGroup', selectedTrt);
    }, [selectedCtrl, selectedTrt]);

    const handleLoadDemo = async () => {
        setLoading(true);
        try {
            const countsRes = await fetch('/data/demo_counts.csv');
            const metadataRes = await fetch('/data/demo_metadata.csv');

            if (countsRes.ok && metadataRes.ok) {
                const countsText = await countsRes.text();
                const metaText = await metadataRes.text();

                const { cleanData, sampleCols } = processCountMatrix(countsText);
                const parsedMeta = Papa.parse(metaText, { header: true, skipEmptyLines: true });

                // Canonicalize metadata to { Sample, Group }
                const normalizedMeta = parsedMeta.data.map((d, i) => {
                    const sample = d.Sample || d.sample || d.ID || d.id || d.Name || d.name || sampleCols[i] || `Sample_${i+1}`;
                    const group = d.Group || d.group || d.condition || d.Condition || 'Control';
                    return {
                        Sample: String(sample).trim(),
                        Group: String(group).trim()
                    };
                });

                const uGroups = Array.from(new Set(normalizedMeta.map(d => d.Group).filter(Boolean)));
                setUniqueGroups([...uGroups, 'Exclude']);

                const ctrl = uGroups.find(g => /control|ctrl|untreated|baseline|vehicle|wt/i.test(g)) || uGroups[0] || 'Control';
                const trt = uGroups.find(g => g !== ctrl && !/exclude/i.test(g)) || uGroups[1] || 'Treated';

                setSelectedCtrl(ctrl);
                setSelectedTrt(trt);
                Storage.setItem('activeControlGroup', ctrl);
                Storage.setItem('activeTreatedGroup', trt);

                const ctrlCount = normalizedMeta.filter(d => d.Group.toLowerCase() === ctrl.toLowerCase()).length;
                const trtCount = normalizedMeta.filter(d => d.Group.toLowerCase() === trt.toLowerCase()).length;

                setSummary({
                    genes: cleanData.length,
                    samples: sampleCols,
                    controlCount: ctrlCount,
                    treatedCount: trtCount
                });

                const cleanCSV = Papa.unparse(cleanData);
                Storage.setItem('rawCounts', cleanCSV);
                Storage.setItem('rawMetadata', Papa.unparse(normalizedMeta));
                Storage.setItem('metaData', JSON.stringify(normalizedMeta));
                setMetaAssignments(normalizedMeta);
                Storage.setItem('analysisMode', 'compute');

                // Clear stale artifacts from previous runs
                Storage.removeItem('filteredCounts');
                Storage.removeItem('pipelineData');
                Storage.removeItem('deseq2Data');
                Storage.removeItem('edgerData');
                Storage.removeItem('limmaData');
                setDegSummary(null);
            } else {
                // Mock fallback if files are not present
                const mockSamples = Array.from({length: 12}, (_, i) => `Sample_${i+1}`);
                const mock = mockSamples.map((s, i) => ({
                    Sample: s,
                    Group: i < 6 ? 'Control' : 'Treated'
                }));
                const mockCounts = [{Gene: 'GENE1'}];
                mockSamples.forEach(s => { mockCounts[0][s] = 10; });

                setSummary({
                    genes: 15000,
                    samples: mockSamples,
                    controlCount: 6,
                    treatedCount: 6
                });
                Storage.setItem('rawCounts', Papa.unparse(mockCounts));
                Storage.setItem('rawMetadata', Papa.unparse(mock));
                Storage.setItem('metaData', JSON.stringify(mock));
                setMetaAssignments(mock);
                Storage.setItem('analysisMode', 'compute');
                Storage.removeItem('filteredCounts');
                Storage.removeItem('pipelineData');
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

            const { cleanData, sampleCols } = processCountMatrix(text);

            // Generate mock metadata by splitting samples into two groups
            const mockMeta = sampleCols.map((s, i) => ({
                Sample: s,
                Group: i < Math.floor(sampleCols.length / 2) ? 'Control' : 'Treated'
            }));

            const ctrlCount = mockMeta.filter(d => d.Group === 'Control').length;
            const trtCount = mockMeta.filter(d => d.Group === 'Treated').length;

            setUniqueGroups(['Control', 'Treated', 'Exclude']);
            setSelectedCtrl('Control');
            setSelectedTrt('Treated');
            Storage.setItem('activeControlGroup', 'Control');
            Storage.setItem('activeTreatedGroup', 'Treated');

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
            Storage.setItem('metaData', JSON.stringify(mockMeta));

            Storage.setItem('analysisMode', 'compute');
            // Clear stale artifacts from previous runs
            Storage.removeItem('filteredCounts');
            Storage.removeItem('pipelineData');
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
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ padding: '2rem', color: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}
        >
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

                                        const { cleanData, sampleCols } = processCountMatrix(text);

                                        const mockMeta = sampleCols.map((s, i) => ({
                                            Sample: s,
                                            Group: i < Math.floor(sampleCols.length / 2) ? 'Control' : 'Treated'
                                        }));

                                        setUniqueGroups(['Control', 'Treated', 'Exclude']);
                                        setSelectedCtrl('Control');
                                        setSelectedTrt('Treated');
                                        Storage.setItem('activeControlGroup', 'Control');
                                        Storage.setItem('activeTreatedGroup', 'Treated');

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
                                        Storage.setItem('metaData', JSON.stringify(mockMeta));

                                        Storage.setItem('analysisMode', 'compute');
                                        // Clear stale artifacts from previous runs
                                        Storage.removeItem('filteredCounts');
                                        Storage.removeItem('pipelineData');
                                        Storage.removeItem('deseq2Data');
                                        Storage.removeItem('edgerData');
                                        Storage.removeItem('limmaData');
                                        setDegSummary(null);
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
                                [`Control (${selectedCtrl})`, summary.controlCount],
                                [`Treated (${selectedTrt})`, summary.treatedCount]
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
                                            const firstLine = text.substring(0, text.indexOf('\n'));
                                            if (firstLine.includes('\t')) delim = '\t';
                                            else if (firstLine.includes(';') && !firstLine.includes(',')) delim = ';';
                                            const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: delim });

                                            // Detect sample and group column headers
                                            const headers = Object.keys(parsed.data[0] || {});
                                            const sampleHeader = headers.find(h => /^(sample|sample_?id|sample_?name|id|name)$/i.test(h.trim())) || headers[0];
                                            const groupHeader = headers.find(h => /^(group|condition|treatment|status|phenotype|type)$/i.test(h.trim())) || (headers.length > 1 ? headers[1] : null);

                                            const metaObj = {};
                                            parsed.data.forEach(row => {
                                                const sample = row[sampleHeader];
                                                const group = groupHeader ? row[groupHeader] : row[Object.keys(row)[1]];
                                                if (sample !== undefined && sample !== null && String(sample).trim() !== '') {
                                                    metaObj[String(sample).trim()] = group !== undefined && group !== null ? String(group).trim() : 'Control';
                                                }
                                            });

                                            const updated = metaAssignments.map(m => {
                                                const sName = String(m.Sample || m.sample || m.ID || m.id || m.Name || m.name || '').trim();
                                                const matchKey = Object.keys(metaObj).find(k => k === sName) ||
                                                                 Object.keys(metaObj).find(k => k.toLowerCase() === sName.toLowerCase());
                                                return {
                                                    Sample: sName,
                                                    Group: matchKey ? metaObj[matchKey] : 'Exclude'
                                                };
                                            });

                                            const assignedGroups = Array.from(new Set(updated.map(d => d.Group).filter(g => g && g !== 'Exclude')));
                                            const allUnique = Array.from(new Set([...assignedGroups, 'Exclude']));
                                            setUniqueGroups(allUnique);

                                            const ctrl = assignedGroups.find(g => /control|ctrl|untreated|baseline|vehicle|wt/i.test(g)) || assignedGroups[0] || 'Control';
                                            const trt = assignedGroups.find(g => g !== ctrl && !/exclude/i.test(g)) || assignedGroups[1] || 'Treated';

                                            setSelectedCtrl(ctrl);
                                            setSelectedTrt(trt);
                                            Storage.setItem('activeControlGroup', ctrl);
                                            Storage.setItem('activeTreatedGroup', trt);

                                            setMetaAssignments(updated);
                                            Storage.setItem('metaData', JSON.stringify(updated));
                                            Storage.setItem('rawMetadata', Papa.unparse(updated));

                                            setSummary(prev => prev ? ({
                                                ...prev,
                                                controlCount: updated.filter(ma => ma.Group.toLowerCase() === ctrl.toLowerCase()).length,
                                                treatedCount: updated.filter(ma => ma.Group.toLowerCase() === trt.toLowerCase()).length
                                            }) : null);
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
                                        const sName = String(m.Sample || m.sample || m.ID || m.id || m.Name || m.name || '').trim();
                                        const sMeta = Object.values(m).join(' ').toLowerCase();
                                        const searchTarget = sName.toLowerCase() + ' ' + sMeta;

                                        let newGrp = 'Exclude';
                                        if (autoFilter && !searchTarget.includes(autoFilter.toLowerCase())) {
                                            newGrp = 'Exclude';
                                        } else if (autoCtrl && searchTarget.includes(autoCtrl.toLowerCase())) {
                                            newGrp = selectedCtrl;
                                        } else if (autoTrt && searchTarget.includes(autoTrt.toLowerCase())) {
                                            newGrp = selectedTrt;
                                        }
                                        return { Sample: sName, Group: newGrp };
                                    });
                                    setMetaAssignments(updated);
                                    Storage.setItem('metaData', JSON.stringify(updated));
                                    Storage.setItem('rawMetadata', Papa.unparse(updated));
                                    setSummary(prev => prev ? ({
                                        ...prev,
                                        controlCount: updated.filter(ma => ma.Group.toLowerCase() === selectedCtrl.toLowerCase()).length,
                                        treatedCount: updated.filter(ma => ma.Group.toLowerCase() === selectedTrt.toLowerCase()).length
                                    }) : null);
                                }} style={{ padding: '0.3rem 0.6rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Auto-Assign</button>
                            </div>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                            {metaAssignments.map((m, idx) => {
                                const sampleName = m.Sample || m.sample || m.ID || m.id || m.Name || m.name || `Sample_${idx}`;
                                const currentGroup = m.Group || m.group || 'Control';
                                return (
                                <div key={sampleName} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: 500, color: currentGroup === 'Exclude' ? '#94a3b8' : '#0f172a' }}>{sampleName}</span>
                                    <select
                                        style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.3rem 0.5rem' }}
                                        value={currentGroup}
                                        onChange={(e) => {
                                            const newGroup = e.target.value;
                                            const updated = metaAssignments.map(ma => {
                                                const maName = ma.Sample || ma.sample || ma.ID || ma.id || ma.Name || ma.name;
                                                return maName === sampleName ? { Sample: maName, Group: newGroup } : { Sample: ma.Sample || maName, Group: ma.Group || ma.group };
                                            });
                                            setMetaAssignments(updated);
                                            Storage.setItem('metaData', JSON.stringify(updated));
                                            Storage.setItem('rawMetadata', Papa.unparse(updated));

                                            setSummary(prev => prev ? ({
                                                ...prev,
                                                controlCount: updated.filter(ma => ma.Group.toLowerCase() === selectedCtrl.toLowerCase()).length,
                                                treatedCount: updated.filter(ma => ma.Group.toLowerCase() === selectedTrt.toLowerCase()).length
                                            }) : null);
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
                                        <select
                                            value={selectedCtrl}
                                            onChange={e => {
                                                const newCtrl = e.target.value;
                                                setSelectedCtrl(newCtrl);
                                                setSummary(prev => prev ? ({
                                                    ...prev,
                                                    controlCount: metaAssignments.filter(ma => (ma.Group || ma.group || '').toLowerCase() === newCtrl.toLowerCase()).length,
                                                    treatedCount: metaAssignments.filter(ma => (ma.Group || ma.group || '').toLowerCase() === selectedTrt.toLowerCase()).length
                                                }) : null);
                                            }}
                                            style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        >
                                            {Array.from(new Set([...uniqueGroups, 'Control', 'Treated'])).map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </label>
                                    <label style={{ fontSize: '0.9rem', color: '#475569' }}>
                                        <strong>Treatment Group: </strong>
                                        <select
                                            value={selectedTrt}
                                            onChange={e => {
                                                const newTrt = e.target.value;
                                                setSelectedTrt(newTrt);
                                                setSummary(prev => prev ? ({
                                                    ...prev,
                                                    controlCount: metaAssignments.filter(ma => (ma.Group || ma.group || '').toLowerCase() === selectedCtrl.toLowerCase()).length,
                                                    treatedCount: metaAssignments.filter(ma => (ma.Group || ma.group || '').toLowerCase() === newTrt.toLowerCase()).length
                                                }) : null);
                                            }}
                                            style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        >
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
        </motion.div>
    );
}
