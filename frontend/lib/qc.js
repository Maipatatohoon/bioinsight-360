import { mean, stddev, rank, median, mad } from './mathUtils.js';

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
 * Identifies outlier samples based on inter-sample correlation, library size, and detection rate
 * Follows arrayQualityMetrics & WGCNA sample network connectivity standards
 * @param {number[]} librarySizes
 * @param {number[]} detectionRates
 * @param {number[][]} [corrMatrix] - samples x samples Spearman correlation matrix
 * @returns {object[]} array of status objects per sample
 */
export function detectOutliers(librarySizes, detectionRates, corrMatrix = null) {
  if (!librarySizes || librarySizes.length === 0) return [];
  const n = librarySizes.length;

  // 1. Inter-sample correlation evaluation
  let meanCorrs = [];
  let medCorr = 1;
  let madCorr = 0;
  if (corrMatrix && corrMatrix.length === n) {
    meanCorrs = corrMatrix.map((row, i) => {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) sum += row[j];
      }
      return n > 1 ? sum / (n - 1) : 1;
    });
    medCorr = median(meanCorrs);
    madCorr = mad(meanCorrs);
  }

  // 2. Library size evaluation (one-sided: low sequencing depth is a quality defect)
  const medianSize = median(librarySizes);
  const madSize = mad(librarySizes);

  // 3. Detection rate evaluation (one-sided: low detection is a quality defect)
  const medianRate = median(detectionRates);
  const madRate = mad(detectionRates);

  return librarySizes.map((size, idx) => {
    const rate = detectionRates ? detectionRates[idx] : 100;
    const avgCorr = meanCorrs.length > 0 ? meanCorrs[idx] : 1;

    // Check correlation (lower correlation than cohort)
    const corrDiff = medCorr - avgCorr;
    const corrZ = madCorr > 0 ? (0.6745 * corrDiff) / madCorr : 0;

    // Check library size (one-sided: lower size than cohort)
    const sizeDiff = medianSize - size;
    const sizeZ = (size < medianSize && madSize > 0) ? (0.6745 * sizeDiff) / madSize : 0;

    // Check detection rate (one-sided: lower rate than cohort)
    const rateDiff = medianRate - rate;
    const rateZ = (rate < medianRate && madRate > 0) ? (0.6745 * rateDiff) / madRate : 0;

    let isOutlier = false;
    let isWarning = false;
    const reasons = [];

    // Standards from arrayQualityMetrics & WGCNA:
    // Outlier: mean correlation < 0.80 or (> 3 MAD below median with r < 0.90)
    if (meanCorrs.length > 0) {
      if (avgCorr < 0.80 || (corrZ > 3.0 && avgCorr < 0.90)) {
        isOutlier = true;
        reasons.push(`Low inter-sample correlation (r=${avgCorr.toFixed(3)})`);
      } else if (avgCorr < 0.85 || (corrZ > 2.0 && avgCorr < 0.92)) {
        isWarning = true;
        reasons.push(`Reduced correlation (r=${avgCorr.toFixed(3)})`);
      }
    }

    // Library size depletion (Fail if < 10% of median or sizeZ > 3.5; Warning if < 30% or sizeZ > 2.5)
    if (size < 0.1 * medianSize || sizeZ > 3.5) {
      isOutlier = true;
      reasons.push(`Severely low library size (${(size / 1e6).toFixed(2)}M reads)`);
    } else if (size < 0.3 * medianSize || sizeZ > 2.5) {
      isWarning = true;
      reasons.push(`Low library size (${(size / 1e6).toFixed(2)}M reads)`);
    }

    // Detection rate depletion (Fail if < 50% or rateZ > 3.5; Warning if < 70% or rateZ > 2.5)
    if (rate < 50 || rateZ > 3.5) {
      isOutlier = true;
      reasons.push(`Severely low detection rate (${rate.toFixed(1)}%)`);
    } else if (rate < 70 || rateZ > 2.5) {
      isWarning = true;
      reasons.push(`Reduced detection rate (${rate.toFixed(1)}%)`);
    }

    const status = isOutlier ? 'Fail' : isWarning ? 'Warning' : 'Pass';
    const reason = reasons.length > 0 ? reasons.join('; ') : 'Normal (Passed all QC criteria)';

    return {
      index: idx,
      avgCorr,
      corrZ,
      sizeZ,
      rateZ,
      isOutlier,
      isWarning,
      reason,
      status
    };
  });
}
