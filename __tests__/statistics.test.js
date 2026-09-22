import { welchTTest, log2FoldChange, benjaminiHochberg, runDifferentialExpression } from '../lib/statistics.js';

describe('Statistics Library', () => {
  test('welchTTest correctly computes p-value and handles zero variance', () => {
    // Normal case
    const group1 = [10, 12, 14, 15, 11];
    const group2 = [2, 3, 4, 1, 3];
    const res = welchTTest(group1, group2);
    expect(res.pvalue).toBeLessThan(0.01);
    
    // Zero variance
    const resZero = welchTTest([10, 10, 10], [10, 10, 10]);
    expect(resZero.pvalue).toBe(1);
    expect(resZero.t).toBe(0);
  });

  test('log2FoldChange calculates correctly with pseudocounts', () => {
    const treated = [15, 31, 63];
    const control = [3, 7, 15];
    // mean(log2(treated + 1)) = mean([4, 5, 6]) = 5
    // mean(log2(control + 1)) = mean([2, 3, 4]) = 3
    // 5 - 3 = 2
    const fc = log2FoldChange(treated, control);
    expect(fc).toBe(2);
  });

  test('benjaminiHochberg adjusts p-values correctly', () => {
    const pvals = [0.01, 0.04, 0.03, 0.001, 0.05];
    const padj = benjaminiHochberg(pvals);
    expect(padj[3]).toBeCloseTo(0.005);
    expect(padj[0]).toBeCloseTo(0.025);
    expect(padj[2]).toBeCloseTo(0.05);
    expect(padj[1]).toBeCloseTo(0.05);
    expect(padj[4]).toBeCloseTo(0.05);
  });

  test('runDifferentialExpression returns expected structure', () => {
    const matrix = [
      [100, 110, 105, 5, 4, 6], // high in 1, low in 2
      [0, 0, 0, 0, 0, 0],       // low expression
      [50, 50, 50, 50, 50, 50]  // same expression
    ];
    const group1 = [0, 1, 2];
    const group2 = [3, 4, 5];
    
    const results = runDifferentialExpression(matrix, group1, group2, 'welch');
    
    expect(results.length).toBe(3);
    
    // Gene 0
    expect(results[0].gene_index).toBe(0);
    expect(results[0].log2fc).toBeLessThan(0); // since it's treated (g2) vs control (g1) in the code
    expect(results[0].pvalue).toBeLessThan(0.05);
    
    // Gene 1 (low expr)
    expect(results[1].log2fc).toBe(0);
    expect(results[1].pvalue).toBe(1);
    
    // Gene 2
    expect(results[2].pvalue).toBe(1);
  });
});
