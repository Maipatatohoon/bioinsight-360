/**
 * Shared math utilities for BioInsight 360
 */

/**
 * Base-2 logarithm with pseudocount handling.
 */
export function log2(x) {
  return Math.log2(x + 1e-8);
}

/**
 * Sum of an array.
 */
export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Arithmetic mean.
 */
export function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

/**
 * Sample variance (Bessel-corrected, divides by N-1).
 */
export function variance(arr) {
  if (!arr || arr.length <= 1) return 0;
  const m = mean(arr);
  return arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1);
}

/**
 * Standard deviation.
 */
export function stddev(arr) {
  return Math.sqrt(variance(arr));
}

/**
 * Median value.
 */
export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * q-th quantile (0 to 1).
 */
export function quantile(arr, q) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Geometric mean (skips zeros).
 */
export function geometricMean(arr) {
  if (!arr || arr.length === 0) return 0;
  const nonZeros = arr.filter(x => x > 0);
  if (nonZeros.length === 0) return 0;
  const sumLog = nonZeros.reduce((a, b) => a + Math.log(b), 0);
  return Math.exp(sumLog / nonZeros.length);
}

/**
 * Returns rank array with averaged ties.
 */
export function rank(arr) {
  if (!arr || arr.length === 0) return [];
  const sorted = arr.map((val, ind) => ({ val, ind })).sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && Object.is(sorted[j].val, sorted[i].val)) j++;
    const avgRank = (i + j - 1) / 2 + 1; // 1-based rank
    for (let k = i; k < j; k++) ranks[sorted[k].ind] = avgRank;
    i = j;
  }
  return ranks;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
export function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/**
 * Log gamma function (Lanczos approximation).
 */
export function lnGamma(x) {
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278224755,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  let g = 7;
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = p[0];
  const t = x + g + 0.5;
  for (let i = 1; i < p.length; i++) a += p[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function (continued fraction approximation).
 */
export function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const beta = Math.exp(lnGamma(a) + lnGamma(b) - lnGamma(a + b));
  let f = 1; let c = 1; let d = 0;
  for (let i = 1; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let num = 0;
    if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-8) break;
  }
  const result = Math.exp(a * Math.log(x) + b * Math.log(1 - x)) / (a * f * beta);
  return result;
}

/**
 * Student's t-distribution CDF approximation.
 */
export function tDistCDF(t, df) {
  const x = df / (t * t + df);
  const prob = regularizedIncompleteBeta(x, df / 2, 0.5) / 2;
  return t > 0 ? 1 - prob : prob;
}

/**
 * Log of binomial coefficient.
 */
export function lnBinomial(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/**
 * Single PMF term for hypergeometric distribution.
 */
export function hypergeometricPMF(k, N, K, n) {
  if (k < 0 || k > Math.min(K, n) || k < Math.max(0, n - (N - K))) return 0;
  return Math.exp(lnBinomial(K, k) + lnBinomial(N - K, n - k) - lnBinomial(N, n));
}

/**
 * Survival function (1 - CDF) for hypergeometric distribution.
 */
export function hypergeometricSF(x, N, K, n) {
  let p = 0;
  for (let k = x; k <= Math.min(K, n); k++) {
    p += hypergeometricPMF(k, N, K, n);
  }
  return Math.min(1, p);
}
