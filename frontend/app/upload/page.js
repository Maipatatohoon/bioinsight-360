'use client';
import { Storage } from '../../lib/storage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { fetchGeoMetadata } from '../../lib/geo_api';
import { motion } from 'framer-motion';
import { submitAnalysisJob, getBackendUrl } from '../../lib/backend_api';
import {
    applyMetadataRows,
    applyMetadataByPosition,
    buildMetadataTemplate,
    chooseComparisonGroups,
    detectMetadataColumns,
    isGeoSoftFile,
    suggestGroupsFromSampleNames,
} from '../../lib/metadataUpload';
import { parseGeoMetadata } from '../../lib/geoMetadata';

/**
 * Read an uploaded file as text, transparently decompressing gzip. GEO
 * metadata is almost always distributed as `.gz`, so rejecting compressed
 * metadata would exclude the most common real-world case.
 */
async function readFileText(file) {
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.gz')) return file.text();

    if (typeof DecompressionStream === 'undefined') {
        throw new Error(
            'This browser cannot decompress .gz files. Unzip the file and upload the plain text instead.'
        );
    }
    const reader = file
        .stream()
        .pipeThrough(new DecompressionStream('gzip'))
        .pipeThrough(new TextDecoderStream())
        .getReader();

    let text = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += value;
    }
    return text;
}

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

    if (sampleCols.some((col) => /^__parsed_extra$/i.test(String(col).trim()))) {
        throw new Error(
            "The count-matrix header is malformed (an extra column was detected). " +
            "Make sure the file is a genes × samples table with matching headers and numeric counts."
        );
    }

    const nonNumericSampleCols = sampleCols.filter((col) => {
        return !parsed.data.some((row) => {
            const raw = row[col];
            if (raw === undefined || raw === null || String(raw).trim() === '') return false;
            return Number.isFinite(Number(raw));
        });
    });
    if (nonNumericSampleCols.length > 0) {
        throw new Error(
            `These columns do not contain numeric counts: ${nonNumericSampleCols.slice(0, 6).join(', ')}. ` +
            "This usually means a metadata/annotation file was uploaded into the count-matrix box, or the CSV is malformed."
        );
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


/**
 * Counts alone do not contain biological group labels. Never invent an
 * alternating split: mark every sample Unassigned and require a metadata file
 * or explicit user assignment before an analysis can be submitted.
 */
export function buildUnassignedMetadata(sampleCols) {
    return (sampleCols || []).map((sample) => ({ Sample: String(sample), Group: 'Unassigned' }));
}

export function selectMetadataRows(assignments, controlGroup, treatedGroup) {
    const control = String(controlGroup || '').toLowerCase();
    const treated = String(treatedGroup || '').toLowerCase();
    return (assignments || [])
        .filter((row) => {
            const group = String(row.Group || row.group || '').toLowerCase();
            return group === control || group === treated;
        })
        .map((row) => ({
            Sample: String(row.Sample || row.sample || row.ID || row.id || row.Name || row.name || '').trim(),
            Group: String(row.Group || row.group || '').trim(),
        }))
        .filter((row) => row.Sample && row.Group);
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

    // Auto-Assign State. Blank keywords mean "infer repeated labels from sample names".
    const [autoCtrl, setAutoCtrl] = useState('');
    const [autoTrt, setAutoTrt] = useState('');
    const [autoFilter, setAutoFilter] = useState('');

    // Group Selection State
    const [uniqueGroups, setUniqueGroups] = useState(['Control', 'Treated']);
    const [selectedCtrl, setSelectedCtrl] = useState('Control');
    const [selectedTrt, setSelectedTrt] = useState('Treated');
    const [metadataReport, setMetadataReport] = useState(null);
    const [pendingMetadata, setPendingMetadata] = useState(null);

    useEffect(() => {
        Storage.setItem('activeControlGroup', selectedCtrl);
        Storage.setItem('activeTreatedGroup', selectedTrt);
    }, [selectedCtrl, selectedTrt]);

    const commitMetadataResult = (result, fileName) => {
        const report = { ...result, source: 'metadata', fileName };
        setMetadataReport(report);

        if (!result.ok) return false;

        const defaults = chooseComparisonGroups(result.groups);
        const nextControl = defaults.control || selectedCtrl || 'Control';
        const nextTreated = defaults.treated || selectedTrt || 'Treated';

        setUniqueGroups(Array.from(new Set([...result.groups, 'Exclude'])));
        setSelectedCtrl(nextControl);
        setSelectedTrt(nextTreated);
        Storage.setItem('activeControlGroup', nextControl);
        Storage.setItem('activeTreatedGroup', nextTreated);

        setMetaAssignments(result.assignments);
        Storage.setItem('metaData', JSON.stringify(result.assignments));
        Storage.setItem('rawMetadata', Papa.unparse(result.assignments));

        setSummary((previous) => previous ? ({
            ...previous,
            controlCount: result.assignments.filter(
                (row) => String(row.Group).toLowerCase() === String(nextControl).toLowerCase()
            ).length,
            treatedCount: result.assignments.filter(
                (row) => String(row.Group).toLowerCase() === String(nextTreated).toLowerCase()
            ).length,
        }) : null);

        return true;
    };

    // If metadata was uploaded before the count matrix, apply it as soon as
    // the count samples exist. This keeps either upload order valid.
    useEffect(() => {
        if (!pendingMetadata || metaAssignments.length === 0) return;
        const result = applyMetadataRows(metaAssignments, pendingMetadata.rows);
        commitMetadataResult(result, pendingMetadata.fileName);
        setPendingMetadata(null);
    }, [pendingMetadata, metaAssignments]);

    const importMetadataRows = (rows, fileName, sourceLabel) => {
        const columns = detectMetadataColumns(Object.keys(rows[0] || {}));
        if (!columns.sampleHeader || !columns.groupHeader) {
            const message =
                'The metadata file needs a sample column and a group/condition column. ' +
                'A plain CSV with Sample and Group is the simplest option.';
            setMetadataReport({ ok: false, error: message, fileName });
            alert(message);
            return;
        }

        // Metadata can be supplied before counts. Hold it until the count
        // sample columns exist, then the effect above applies it.
        if (metaAssignments.length === 0) {
            setPendingMetadata({ fileName, rows, columns, sourceLabel });
            setMetadataReport(null);
            return;
        }

        let result = applyMetadataRows(metaAssignments, rows);

        // Identifiers can differ while describing the same samples (GEO GSM
        // accessions vs local column names). Offer an explicit, confirmed
        // positional match instead of dead-ending the user.
        if (!result.ok && !result.matched && rows.length === metaAssignments.length) {
            const countPreview = metaAssignments
                .slice(0, 5)
                .map((row) => row.Sample)
                .join(', ');
            const metaPreview = rows
                .slice(0, 5)
                .map((row) => row[result.columns.sampleHeader])
                .join(', ');
            const proceed = window.confirm(
                `No sample IDs matched, but both files contain ${rows.length} samples.\n\n` +
                `Count matrix columns: ${countPreview}${metaAssignments.length > 5 ? ', …' : ''}\n` +
                `Metadata sample IDs: ${metaPreview}${rows.length > 5 ? ', …' : ''}\n\n` +
                'If the rows are in the same order as the count columns, match them by position.\n' +
                'Only choose OK if you have checked that order; a wrong order swaps control and treatment.'
            );
            if (proceed) result = applyMetadataByPosition(metaAssignments, rows);
        }

        const applied = commitMetadataResult(result, fileName);
        if (!applied) {
            const detected = result.columns
                ? `Sample column: ${result.columns.sampleHeader || 'none'} · group column: ${result.columns.groupHeader || 'none'}`
                : '';
            alert(
                `${result.error}\n\n${detected}\n\n` +
                'Your count matrix columns and the metadata sample IDs must refer to the same samples. ' +
                'You can also assign groups directly in the table below — metadata is optional.'
            );
        }
    };

    const handleMetadataFile = async (file) => {
        if (!file) return;
        try {
            const text = await readFileText(file);

            // GEO series matrix and SOFT family files are full records, but they
            // do contain per-sample titles and characteristics, which is exactly
            // the sample/group information needed here.
            if (isGeoSoftFile(file.name, text)) {
                const geo = parseGeoMetadata(text);
                if (!geo.ok || !geo.rows.length) {
                    throw new Error(geo.error || 'Could not read samples from this GEO file.');
                }
                if (geo.groups.length < 2) {
                    const message =
                        `Read ${geo.rows.length} sample(s) from this GEO file, but could not find two ` +
                        'experimental groups in its titles or characteristics.\n\n' +
                        'Assign groups manually in the table below, or upload a CSV with Sample and Group columns.';
                    setMetadataReport({ ok: false, error: message, fileName: file.name });
                    alert(message);
                    return;
                }
                const label = geo.source === 'soft' ? 'GEO SOFT' : 'GEO series matrix';
                importMetadataRows(geo.rows, file.name, label);
                return;
            }

            const firstLine = text.substring(0, Math.max(0, text.indexOf('\n')));
            let delimiter = ',';
            if (firstLine.includes('\t')) delimiter = '\t';
            else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

            const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter });
            if (!parsed.data.length) {
                throw new Error('The metadata file has no data rows.');
            }

            importMetadataRows(parsed.data, file.name, 'metadata');
        } catch (error) {
            console.error('Metadata import failed:', error);
            setMetadataReport({ ok: false, error: error.message, fileName: file.name });
            alert(`Failed to parse metadata file: ${error.message}`);
        }
    };

    const handleDownloadMetadataTemplate = () => {
        if (!metaAssignments.length) return;
        const csv = buildMetadataTemplate(metaAssignments);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bioinsight_metadata_template.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    };

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

                // Canonicalize metadata to one row per count-matrix sample.
                // A missing group is Unassigned, never an invented Control.
                const demoGroups = new Map();
                parsedMeta.data.forEach((d) => {
                    const sample = d.Sample || d.sample || d.ID || d.id || d.Name || d.name;
                    if (!sample) return;
                    const group = d.Group || d.group || d.condition || d.Condition || 'Unassigned';
                    demoGroups.set(String(sample).trim(), String(group).trim());
                });
                const lowerDemoGroups = new Map(
                    Array.from(demoGroups.entries()).map(([sample, group]) => [sample.toLowerCase(), group]),
                );
                const normalizedMeta = sampleCols.map((sample) => ({
                    Sample: String(sample).trim(),
                    Group: demoGroups.get(String(sample).trim())
                        || lowerDemoGroups.get(String(sample).trim().toLowerCase())
                        || 'Unassigned',
                }));

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
                Storage.removeItem('currentJobId');
                Storage.setItem('rawCounts', cleanCSV);
                Storage.setItem('rawMetadata', Papa.unparse(normalizedMeta));
                Storage.setItem('metaData', JSON.stringify(normalizedMeta));
                setMetaAssignments(normalizedMeta);
                setMetadataReport(null);
                Storage.setItem('analysisMode', 'compute');

                // Clear stale artifacts from previous runs
                Storage.removeItem('filteredCounts');
                Storage.removeItem('pipelineData');
                Storage.removeItem('deseq2Data');
                Storage.removeItem('edgerData');
                Storage.removeItem('limmaData');
                setDegSummary(null);
            } else {
                // Fail if actual demo data missing
                throw new Error('Failed to fetch demo dataset files (GSE52778).');
            }
        } catch (e) {
            console.error('Failed to load demo', e);
            alert("Failed to load demo dataset: " + e.message);
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
            const unassignedMeta = buildUnassignedMetadata(sampleCols);

            setUniqueGroups(['Unassigned', 'Control', 'Treated', 'Exclude']);
            setSelectedCtrl('Control');
            setSelectedTrt('Treated');
            Storage.setItem('activeControlGroup', 'Control');
            Storage.setItem('activeTreatedGroup', 'Treated');

            setSummary({
                genes: cleanData.length,
                samples: sampleCols,
                controlCount: 0,
                treatedCount: 0
            });

            setMetaAssignments(unassignedMeta);
            setMetadataReport(null);

            // Force conversion to strictly comma-separated CSV so our downstream manual parsers work
            const cleanCSV = Papa.unparse(cleanData);
            Storage.removeItem('currentJobId');
            Storage.setItem('rawCounts', cleanCSV);
            Storage.setItem('rawMetadata', Papa.unparse(unassignedMeta));
            Storage.setItem('metaData', JSON.stringify(unassignedMeta));

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
            <div className="page-header">
                <span className="page-eyebrow">Step 1 · Data</span>
                <h1 className="page-title">
                    Upload &amp; Dataset Configuration
                </h1>
            </div>
            
            <div className="glass-panel" style={{ padding: '2rem' }}>
                
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
                                        const unassignedMeta = buildUnassignedMetadata(sampleCols);

                                        setUniqueGroups(['Unassigned', 'Control', 'Treated', 'Exclude']);
                                        setSelectedCtrl('Control');
                                        setSelectedTrt('Treated');
                                        Storage.setItem('activeControlGroup', 'Control');
                                        Storage.setItem('activeTreatedGroup', 'Treated');

                                        setSummary({
                                            genes: cleanData.length,
                                            samples: sampleCols,
                                            controlCount: 0,
                                            treatedCount: 0
                                        });

                                        setMetaAssignments(unassignedMeta);
                                        setMetadataReport(null);

                                        // Force conversion to strictly comma-separated CSV so our downstream manual parsers work
                                        const cleanCSV = Papa.unparse(cleanData);
                                        Storage.removeItem('currentJobId');
                                        Storage.setItem('rawCounts', cleanCSV);
                                        Storage.setItem('rawMetadata', Papa.unparse(unassignedMeta));
                                        Storage.setItem('metaData', JSON.stringify(unassignedMeta));

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
                            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.78rem', color: '#0369a1', fontWeight: 700, letterSpacing: '0.04em' }}>1. RAW COUNT MATRIX (REQUIRED)</p>
                            <p style={{ fontSize: '1.2rem', color: '#0369a1', fontWeight: 600 }}>Drag and drop raw count matrix CSV here</p>
                            <p style={{ fontSize: '0.9rem', color: '#0ea5e9', marginTop: '0.5rem' }}>or click to browse your computer</p>
                        </label>
                        
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <button onClick={handleLoadDemo} disabled={loading} style={{ padding: '0.75rem 1.5rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
                                {loading ? 'Loading...' : 'Load Demo Dataset (GSE52778)'}
                            </button>
                            <span style={{ color: '#64748b' }}>Used for quick evaluation without files</span>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.25rem 1.5rem', background: '#faf5ff', border: '2px dashed #c4b5fd', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ maxWidth: '680px' }}>
                                <h3 style={{ margin: 0, color: '#5b21b6', fontSize: '1.05rem' }}>2. Sample metadata (optional)</h3>
                                <p style={{ margin: '0.35rem 0 0 0', color: '#6d28d9', fontSize: '0.88rem', lineHeight: 1.5 }}>
                                    Upload a <strong>CSV/TSV</strong> with Sample and Group columns, or a GEO
                                    <strong> series matrix</strong> / <strong>SOFT family</strong> file — groups are read
                                    from its sample titles and characteristics. A count matrix is always required;
                                    metadata only tells the app which samples are control and treatment.
                                </p>
                                {pendingMetadata ? (
                                    <div style={{ marginTop: '0.5rem', color: '#047857', fontSize: '0.85rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <strong>✓ {pendingMetadata.fileName} selected.</strong>
                                        <span>It will be matched when you upload the count matrix.</span>
                                        <button onClick={() => setPendingMetadata(null)} style={{ padding: '0.15rem 0.5rem', background: '#fff', color: '#6d28d9', border: '1px solid #c4b5fd', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                            Remove
                                        </button>
                                    </div>
                                ) : metadataReport?.source === 'metadata' ? (
                                    <div style={{ marginTop: '0.5rem', color: metadataReport.ok ? '#047857' : '#b91c1c', fontSize: '0.85rem' }}>
                                        <strong>{metadataReport.ok ? '✓ Metadata applied' : 'Metadata not applied'}:</strong> {metadataReport.fileName}
                                        {!metadataReport.ok && metadataReport.error ? ` — ${metadataReport.error}` : ''}
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '0.5rem', color: '#7c3aed', fontSize: '0.82rem' }}>
                                        No metadata file selected. Without it, assign groups manually after loading counts.
                                    </div>
                                )}
                            </div>
                            <label style={{ padding: '0.65rem 1.1rem', background: '#7c3aed', color: '#fff', border: '1px solid #6d28d9', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                Upload Metadata
                                <input
                                    type="file"
                                    accept=".csv,.tsv,.txt,.gz,.soft"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        handleMetadataFile(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
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
                                                    Storage.setItem('downstreamSource', 'upload');
                                                    // Clear stale compute-mode artifacts
                                                    Storage.removeItem('currentJobId');
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

                        {metaAssignments.filter((row) => /^(unassigned|exclude)$/i.test(String(row.Group || row.group || ''))).length > 0 && (
                            <div style={{ marginBottom: '1.5rem', padding: '0.9rem 1rem', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.9rem' }}>
                                <strong>{metaAssignments.filter((row) => /^(unassigned|exclude)$/i.test(String(row.Group || row.group || ''))).length} sample(s) are Unassigned/Exclude.</strong>{' '}
                                {metaAssignments.filter((row) => !/^(unassigned|exclude)$/i.test(String(row.Group || row.group || ''))).length === 0 ? (
                                    <>
                                        The analysis cannot start until at least two samples are control and two are treatment.
                                        Assign each sample in the table below, or upload metadata with Sample and Group columns.
                                        <button
                                            onClick={() => document.getElementById('group-assignment')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                            style={{ marginLeft: '0.6rem', padding: '0.2rem 0.6rem', background: '#fff', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                                        >
                                            Assign groups below
                                        </button>
                                    </>
                                ) : (
                                    <>Only samples in the selected control and treatment groups are submitted. Excluded samples are expected when your metadata covers a subset of the count matrix; each selected group needs at least 2 replicates.</>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h4 style={{ margin: 0, color: '#334155' }}>Metadata Assignment</h4>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                    Upload a CSV/TSV with <strong>Sample</strong> and <strong>Group</strong> columns, or a GEO series matrix / SOFT file. Otherwise assign each sample below — metadata is optional.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <label style={{ padding: '0.5rem 1rem', background: '#0284c7', color: '#fff', border: '1px solid #0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                    Upload Metadata
                                    <input
                                        type="file"
                                        accept=".csv,.tsv,.txt,.gz,.soft"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            handleMetadataFile(file);
                                            e.target.value = '';
                                        }}
                                    />
                                </label>
                                <button
                                    onClick={handleDownloadMetadataTemplate}
                                    title="Download a CSV with all current sample IDs and editable Group values."
                                    style={{ padding: '0.5rem 1rem', background: '#fff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                                >
                                    Download Template
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f1f5f9', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <input type="text" value={autoCtrl} onChange={(e) => setAutoCtrl(e.target.value)} placeholder="Control keyword (optional)" style={{ width: '145px', fontSize: '0.8rem', padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                <input type="text" value={autoTrt} onChange={(e) => setAutoTrt(e.target.value)} placeholder="Treated keyword (optional)" style={{ width: '145px', fontSize: '0.8rem', padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                <input type="text" value={autoFilter} onChange={(e) => setAutoFilter(e.target.value)} placeholder="Required (e.g. Oocyte)" style={{ width: '130px', fontSize: '0.8rem', padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} title="If set, samples lacking this word are Excluded." />
                                <button onClick={() => {
                                    const samples = metaAssignments.map((m) =>
                                        String(m.Sample || m.sample || m.ID || m.id || m.Name || m.name || '').trim()
                                    );

                                    if (!autoCtrl.trim() && !autoTrt.trim() && !autoFilter.trim()) {
                                        const suggestion = suggestGroupsFromSampleNames(samples);
                                        if (!suggestion.ok) {
                                            alert(
                                                `${suggestion.error}\n\n` +
                                                'Sample-name inference is only a convenience. Upload a metadata CSV when the sample names do not contain group labels.'
                                            );
                                            return;
                                        }

                                        setMetaAssignments(suggestion.assignments);
                                        Storage.setItem('metaData', JSON.stringify(suggestion.assignments));
                                        Storage.setItem('rawMetadata', Papa.unparse(suggestion.assignments));
                                        setUniqueGroups(Array.from(new Set([...suggestion.groups, 'Exclude'])));
                                        setSelectedCtrl(suggestion.control);
                                        setSelectedTrt(suggestion.treated);
                                        Storage.setItem('activeControlGroup', suggestion.control);
                                        Storage.setItem('activeTreatedGroup', suggestion.treated);
                                        setSummary((prev) => prev ? ({
                                            ...prev,
                                            controlCount: suggestion.assignments.filter(
                                                (row) => row.Group.toLowerCase() === String(suggestion.control).toLowerCase()
                                            ).length,
                                            treatedCount: suggestion.assignments.filter(
                                                (row) => row.Group.toLowerCase() === String(suggestion.treated).toLowerCase()
                                            ).length,
                                        }) : null);
                                        setMetadataReport({
                                            ok: true,
                                            source: 'sample_names',
                                            fileName: 'sample names',
                                            matched: suggestion.assignments.length,
                                            groupCounts: suggestion.groupCounts,
                                            groups: suggestion.groups,
                                            unmatchedCountSamples: [],
                                            metadataOnlySamples: [],
                                            duplicateSamples: [],
                                        });
                                        return;
                                    }

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
                                    setMetadataReport(null);
                                    setSummary(prev => prev ? ({
                                        ...prev,
                                        controlCount: updated.filter(ma => ma.Group.toLowerCase() === selectedCtrl.toLowerCase()).length,
                                        treatedCount: updated.filter(ma => ma.Group.toLowerCase() === selectedTrt.toLowerCase()).length
                                    }) : null);
                                }} title="Leave both keyword fields blank to suggest groups from repeated labels in sample names. Keyword matching still works when either field is filled." style={{ padding: '0.3rem 0.6rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Auto-Assign</button>
                            </div>
                        </div>
                        {metadataReport && (
                            <div style={{
                                marginBottom: '1rem',
                                padding: '0.9rem 1rem',
                                borderRadius: '10px',
                                background: metadataReport.ok ? '#f0f9ff' : '#fef2f2',
                                border: `1px solid ${metadataReport.ok ? '#bae6fd' : '#fecaca'}`,
                                color: metadataReport.ok ? '#075985' : '#991b1b',
                                fontSize: '0.85rem',
                                lineHeight: 1.6,
                            }}>
                                {metadataReport.ok ? (
                                    <>
                                        <strong>
                                            {metadataReport.source === 'sample_names'
                                                ? `Groups suggested from sample-name labels: ${metadataReport.matched}/${metaAssignments.length} samples assigned. Verify these labels before submitting.`
                                                : `Metadata applied from ${metadataReport.fileName}: ${metadataReport.matched}/${metaAssignments.length} count samples matched.`}
                                        </strong>
                                        {Object.keys(metadataReport.groupCounts || {}).length > 0 && (
                                            <div>
                                                Groups: {Object.entries(metadataReport.groupCounts || {}).map(([group, count]) => `${group} (${count})`).join(' · ')}
                                            </div>
                                        )}
                                        {metadataReport.unmatchedCountSamples?.length > 0 && (
                                            <div>
                                                Not in metadata, excluded: {metadataReport.unmatchedCountSamples.slice(0, 8).join(', ')}
                                                {metadataReport.unmatchedCountSamples.length > 8 ? ` +${metadataReport.unmatchedCountSamples.length - 8} more` : ''}
                                            </div>
                                        )}
                                        {metadataReport.metadataOnlySamples?.length > 0 && (
                                            <div>
                                                Metadata-only IDs (not count columns): {metadataReport.metadataOnlySamples.slice(0, 8).join(', ')}
                                                {metadataReport.metadataOnlySamples.length > 8 ? ` +${metadataReport.metadataOnlySamples.length - 8} more` : ''}
                                            </div>
                                        )}
                                        {metadataReport.duplicateSamples?.length > 0 && (
                                            <div>
                                                Duplicate metadata IDs (last row kept): {metadataReport.duplicateSamples.slice(0, 8).join(', ')}
                                            </div>
                                        )}
                                        {metadataReport.extraColumns?.length > 0 && (
                                            <div style={{ color: '#92400e' }}>
                                                Extra columns are not used in this two-group analysis:{' '}
                                                {metadataReport.extraColumns.map((column) =>
                                                    `${column.name} (${column.values.slice(0, 6).join(', ')}${column.values.length > 6 ? ', …' : ''})`
                                                ).join('; ')}
                                                . If these are separate biological strata, upload metadata for one value at a time.
                                            </div>
                                        )}
                                        <div style={{ marginTop: '0.25rem', color: '#0369a1' }}>
                                            Check the default groups below before submitting. You can change them at any time.
                                        </div>
                                    </>
                                ) : (
                                    <strong>Metadata not applied: {metadataReport.error}</strong>
                                )}
                            </div>
                        )}
                        <div id="group-assignment" style={{ maxHeight: '300px', overflowY: 'auto', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                            {metaAssignments.map((m, idx) => {
                                const sampleName = m.Sample || m.sample || m.ID || m.id || m.Name || m.name || `Sample_${idx}`;
                                const currentGroup = m.Group || m.group || 'Unassigned';
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
                            <button onClick={async () => {
                                setLoading(true);
                                try {
                                    const countsStr = Storage.getItem('rawCounts');
                                    if (!countsStr) {
                                        throw new Error("Missing count matrix. Re-upload the count file.");
                                    }
                                    if (selectedCtrl === selectedTrt) {
                                        throw new Error("Control and treatment groups must be different.");
                                    }

                                    const selectedRows = selectMetadataRows(metaAssignments, selectedCtrl, selectedTrt);
                                    const ctrlCount = selectedRows.filter((row) => row.Group.toLowerCase() === selectedCtrl.toLowerCase()).length;
                                    const trtCount = selectedRows.filter((row) => row.Group.toLowerCase() === selectedTrt.toLowerCase()).length;
                                    if (ctrlCount < 2 || trtCount < 2) {
                                        throw new Error(
                                            `Each selected group needs at least 2 samples. ` +
                                            `Control (${selectedCtrl}): ${ctrlCount}; Treatment (${selectedTrt}): ${trtCount}. ` +
                                            `Upload a metadata CSV or assign groups in the table above.`
                                        );
                                    }

                                    const selectedMetadataCsv = Papa.unparse(selectedRows);
                                    const countsBlob = new Blob([countsStr], { type: 'text/csv' });
                                    const metadataBlob = new Blob([selectedMetadataCsv], { type: 'text/csv' });

                                    // The backend validator renames the grouping column to
                                    // `condition`; the R scripts receive explicit numerator/
                                    // denominator levels, so group names containing `_` or
                                    // spaces keep their intended contrast direction.
                                    const params = {
                                        control_group: selectedCtrl,
                                        treated_group: selectedTrt,
                                        condition_col: 'Group',
                                        design: '~ condition'
                                    };

                                    const jobRes = await submitAnalysisJob(countsBlob, metadataBlob, params);

                                    Storage.setItem('currentJobId', jobRes.job_id);
                                    Storage.setItem('downstreamSource', 'job');
                                    // Result pages read the three method tables from
                                    // the backend job; mark that explicitly.
                                    Storage.setItem('analysisMode', 'downstream');
                                    Storage.setItem('activeControlGroup', selectedCtrl);
                                    Storage.setItem('activeTreatedGroup', selectedTrt);
                                    Storage.setItem('rawMetadata', selectedMetadataCsv);
                                    Storage.setItem('metaData', JSON.stringify(selectedRows));

                                    // The count matrix is large; metadata is small and is
                                    // retained so Export can report the real sample groups.
                                    Storage.removeItem('rawCounts');

                                    router.push('/qc');
                                } catch (e) {
                                    const networkFailure =
                                        e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e.message || '');
                                    if (networkFailure) {
                                        alert(
                                            `Cannot reach the analysis backend at:\n${getBackendUrl()}\n\n` +
                                            'The backend is not running, or this deployment has no default backend configured.\n\n' +
                                            'Open “Backend” in the navbar, paste the live backend URL, and press “Test & Save”. ' +
                                            'Pre-computed DEG mode does not need a backend.'
                                        );
                                    } else {
                                        alert("Analysis submission failed: " + e.message);
                                    }
                                } finally {
                                    setLoading(false);
                                }
                            }} disabled={loading} style={{ padding: '1rem 2.5rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)', transition: 'transform 0.2s', opacity: loading ? 0.7 : 1 }} onMouseOver={(e) => !loading && (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseOut={(e) => !loading && (e.currentTarget.style.transform = 'none')}>
                                {loading ? 'Submitting...' : 'Proceed to QC & Analysis →'}
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
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Methods Loaded</div>
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
