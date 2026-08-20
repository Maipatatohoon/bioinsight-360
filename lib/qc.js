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

    if (sizeZ > 2.5) {
      isOutlier = true;
      reason = `Extreme library size (z=${sizeZ.toFixed(2)})`;
      status = 'Fail';
    } else if (rateZ > 2.5) {
      isOutlier = true;
      reason = `Low detection rate (z=${rateZ.toFixed(2)})`;
      status = 'Fail';
    } else if (sizeZ > 1.8 || rateZ > 1.8) {
      reason = 'Moderate deviation from mean';
      status = 'Warning';
    }

    return { index: idx, sizeZ, rateZ, isOutlier, reason, status };
  });
}
