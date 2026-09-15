import { sum, quantile, geometricMean, median } from './mathUtils.js';

/**
 * Normalizes a gene expression matrix using Counts Per Million (CPM).
 * @param {Array<Array<number>>} matrix - Genes (rows) x Samples (cols)
 * @returns {Array<Array<number>>} Normalized matrix
 */
export function normalizeCPM(matrix) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const colSums = new Array(numSamples).fill(0);
  
  for (let j = 0; j < numSamples; j++) {
    for (let i = 0; i < numGenes; i++) {
      colSums[j] += Math.max(0, matrix[i][j]);
    }
  }
  
  const normMatrix = Array.from({ length: numGenes }, () => new Array(numSamples));
  for (let i = 0; i < numGenes; i++) {
    for (let j = 0; j < numSamples; j++) {
      normMatrix[i][j] = colSums[j] > 0 ? (matrix[i][j] / colSums[j]) * 1e6 : 0;
    }
  }
  return normMatrix;
}

/**
 * Normalizes a gene expression matrix using Upper Quartile (UQ) method.
 * @param {Array<Array<number>>} matrix - Genes x Samples
 * @returns {Array<Array<number>>} Normalized matrix
 */
export function normalizeUpperQuartile(matrix) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const sizeFactors = new Array(numSamples).fill(1);
  
  for (let j = 0; j < numSamples; j++) {
    const nonZeros = [];
    for (let i = 0; i < numGenes; i++) {
      if (matrix[i][j] > 0) nonZeros.push(matrix[i][j]);
    }
    const uq = quantile(nonZeros, 0.75);
    sizeFactors[j] = uq > 0 ? uq : 1;
  }
  
  const meanUQ = sum(sizeFactors) / sizeFactors.length;
  const normMatrix = Array.from({ length: numGenes }, () => new Array(numSamples));
  for (let i = 0; i < numGenes; i++) {
    for (let j = 0; j < numSamples; j++) {
      normMatrix[i][j] = matrix[i][j] / (sizeFactors[j] / meanUQ);
    }
  }
  return normMatrix;
}

/**
 * Normalizes a gene expression matrix using Median of Ratios (DESeq2 style).
 * @param {Array<Array<number>>} matrix - Genes x Samples
 * @returns {Array<Array<number>>} Normalized matrix
 */
export function normalizeMedianOfRatios(matrix) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  const numGenes = matrix.length;
  const numSamples = matrix[0].length;
  const geoMeans = new Array(numGenes);
  
  for (let i = 0; i < numGenes; i++) {
    geoMeans[i] = geometricMean(matrix[i]);
  }
  
  const sizeFactors = new Array(numSamples).fill(1);
  for (let j = 0; j < numSamples; j++) {
    const ratios = [];
    for (let i = 0; i < numGenes; i++) {
      if (geoMeans[i] > 0 && matrix[i][j] > 0) {
        ratios.push(matrix[i][j] / geoMeans[i]);
      }
    }
    const sf = median(ratios);
    sizeFactors[j] = sf > 0 ? sf : 1;
  }
  
  const normMatrix = Array.from({ length: numGenes }, () => new Array(numSamples));
  for (let i = 0; i < numGenes; i++) {
    for (let j = 0; j < numSamples; j++) {
      normMatrix[i][j] = matrix[i][j] / sizeFactors[j];
    }
  }
  return normMatrix;
}
