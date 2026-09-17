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
                                        
                                        // Clean parsed data: remove empty keys
                                        const cleanData = parsed.data.map(row => {
                                            const newRow = { ...row };
                                            Object.keys(newRow).forEach(key => {
                                                if (key.trim() === '') delete newRow[key];
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
