/**
 * QC Web Worker — runs heavy computation off the main thread.
 * Receives: { rawMatrix, geneNames, sampleNames, sampleGroups, cpmThreshold }
 * Returns: full qcData object ready for rendering.
 */

// === Inline math utilities (workers can't import ES modules) ===

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

// === Worker message handler ===
self.onmessage = function(e) {
  const { rawMatrix, geneNames, sampleNames, sampleGroups, cpmThreshold } = e.data;

  // 1. Filter
  const { filteredMatrix, filteredGenes } = filterByCPM(rawMatrix, geneNames, cpmThreshold, 2);
  const filteredCSV = matrixToCSV(filteredMatrix, filteredGenes, sampleNames);

  // 2. QC metrics on raw matrix
  const librarySizes = computeLibrarySizes(rawMatrix);
  const detectionRates = computeDetectionRates(rawMatrix);
  const corrMatrix = computeSampleCorrelation(filteredMatrix);
  const outlierStatus = detectOutliers(librarySizes, detectionRates);

  // 3. PCA
  const samplesMatrix = Array.from({ length: sampleNames.length }, (_, s) =>
    filteredMatrix.map(row => row[s])
  );
  const pcaResult = computePCA(samplesMatrix, 2);

  const avgLibSize = librarySizes.reduce((a, b) => a + b, 0) / librarySizes.length;
  const avgDetRate = detectionRates.reduce((a, b) => a + b, 0) / detectionRates.length;
  const outlierCount = outlierStatus.filter(s => s.isOutlier).length;

  self.postMessage({
    filteredCSV,
    qcData: {
      sampleNames, sampleGroups, librarySizes, detectionRates, corrMatrix,
      outlierStatus, pcaResult, avgLibSize, avgDetRate, outlierCount,
      genesRetained: filteredGenes.length, totalGenes: geneNames.length
    }
  });
};
