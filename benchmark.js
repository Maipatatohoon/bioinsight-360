import fs from 'fs';
import { performance } from 'perf_hooks';
import { runAllPipelines } from './lib/consensus.js';

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

async function runBenchmark() {
  console.log("Loading datasets for benchmark...");
  
  // Use public demo data for benchmarking
  const rawCountsCSV = fs.readFileSync('public/data/demo_counts.csv', 'utf8');
  const rawMetaCSV = fs.readFileSync('public/data/demo_metadata.csv', 'utf8');

  console.log("Parsing metadata...");
  const metaLines = rawMetaCSV.trim().split('\n');
  const groupMap = {};
  let sampleNames = [];
  
  for (let i = 1; i < metaLines.length; i++) {
    if (!metaLines[i].trim()) continue;
    const [s, g] = parseCSVRow(metaLines[i]);
    groupMap[s] = (g || '').toLowerCase();
  }

  console.log("Parsing counts...");
  const countLines = rawCountsCSV.trim().split('\n');
  const header = parseCSVRow(countLines[0]);
  sampleNames = header.slice(1);
  
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

  const geneNames = [];
  const countsMatrix = [];
  
  for (let i = 1; i < countLines.length; i++) {
    if (!countLines[i].trim()) continue;
    const parts = parseCSVRow(countLines[i]);
    geneNames.push(parts[0]);
    countsMatrix.push(parts.slice(1).map(Number));
  }

  console.log(`Loaded ${geneNames.length} genes and ${sampleNames.length} samples (${controlIndices.length} control, ${treatedIndices.length} treated).`);

  console.log("Starting JS consensus pipelines benchmark...");
  const startTime = performance.now();

  const results = runAllPipelines(countsMatrix, geneNames, controlIndices, treatedIndices);

  const endTime = performance.now();
  const durationMs = endTime - startTime;

  console.log(`[Benchmark] runAllPipelines executed in ${durationMs.toFixed(2)} ms`);
  console.log(`Pipelines generated: ${results.pipelines.length}`);
}

runBenchmark().catch(console.error);
