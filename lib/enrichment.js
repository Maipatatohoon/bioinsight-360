import { hypergeometricSF } from './mathUtils.js';
import { benjaminiHochberg } from './statistics.js';

/**
 * Hypergeometric survival function test (p-value of observing >= k overlapping genes).
 */
export function hypergeometricTest(k, N, K, n) {
  return hypergeometricSF(k, N, K, n);
}

/**
 * Run GO pathway enrichment over a list of differentially expressed genes.
 * @param {Array<string>} degList List of significant gene names
 * @param {Array<Object>} goAnnotations Array of { term, name, genes: [] }
 * @param {Array<string>} allGenes Background gene universe
 */
export function runGOEnrichment(degList, goAnnotations, allGenes) {
  if (!degList || !allGenes || allGenes.length === 0 || !goAnnotations) return [];
  // Use case-insensitive matching
  const degSet = new Set(degList.map(g => g.toUpperCase()));
  const allSet = new Set(allGenes.map(g => g.toUpperCase()));
  
  const N = allSet.size;
  const n = degSet.size;
  
  const results = [];
  const pvalues = [];
  
  for (const go of goAnnotations) {
    if (!go.genes || go.genes.length === 0) continue;
    
    // Restrict GO term genes to the background universe (case-insensitive, deduplicated)
    const validGenes = [...new Set(go.genes.map(g => g.toUpperCase()))].filter(g => allSet.has(g));
    const K = validGenes.length;
    
    // SPECIFICITY FILTER: Ignore tiny noisy terms (<3) and massive generic terms (>500)
    // This prevents useless terms like "cellular process" from burying informative biological pathways
    if (K < 3 || K > 500) continue;
    
    const overlappingGenes = validGenes.filter(g => degSet.has(g));
    const k = overlappingGenes.length;
    
    const pval = hypergeometricTest(k, N, K, n);
    const expected = (n * K) / N;
    const enrichmentRatio = expected === 0 ? 0 : k / expected;
    
    pvalues.push(pval);
    results.push({
      term: go.term,
      name: go.name,
      pvalue: pval,
      padj: 1, // Set after BH
      overlap: k,
      overlappingGenes: overlappingGenes,
      termGeneCount: K,
      expected: expected,
      enrichmentRatio: enrichmentRatio
    });
  }
  
  const padjs = benjaminiHochberg(pvalues);
  for (let i = 0; i < results.length; i++) {
    results[i].padj = padjs[i];
  }
  
  return results.sort((a, b) => a.pvalue - b.pvalue);
}

/**
 * Computes pathway enrichment consensus across 6 pipelines.
 * @param {Array<Array<Object>>} pipelineEnrichments Array of 6 GO enrichment result arrays
 * @param {number} pThreshold Significance threshold (default 0.05)
 */
export function computePathwayConsensus(pipelineEnrichments, pThreshold = 0.05) {
  if (!pipelineEnrichments || pipelineEnrichments.length === 0) return [];
  
  const pathwayMap = new Map();
  const numPipelines = pipelineEnrichments.length;
  
  for (let pIdx = 0; pIdx < numPipelines; pIdx++) {
    const pipe = pipelineEnrichments[pIdx];
    if (!pipe) continue;
    
    for (const enrich of pipe) {
      if (!pathwayMap.has(enrich.term)) {
        pathwayMap.set(enrich.term, {
          term: enrich.term,
          name: enrich.name,
          count: 0,
          pvalues: [],
          overlaps: [],
          allOverlappingGenes: new Set()
        });
      }
      
      const item = pathwayMap.get(enrich.term);
      item.pvalues.push(enrich.padj !== undefined ? enrich.padj : enrich.pvalue);
      item.overlaps.push(enrich.overlap);
      enrich.overlappingGenes.forEach(g => item.allOverlappingGenes.add(g));
      
      if (enrich.pvalue < pThreshold && enrich.overlap > 0) {
        item.count++;
      }
    }
  }
  
  const results = Array.from(pathwayMap.values()).map(p => {
    let category = 'not_significant';
    if (p.count >= 5) category = 'high_confidence';
    else if (p.count >= 3) category = 'moderate_confidence';
    else if (p.count >= 1) category = 'method_sensitive';
    
    const sortedPvalues = [...p.pvalues].sort((a, b) => a - b);
    const medianPvalue = sortedPvalues.length > 0 ? sortedPvalues[Math.floor(sortedPvalues.length / 2)] : 1;
    const maxOverlap = p.overlaps.length > 0 ? Math.max(...p.overlaps) : 0;
    
    return {
      term: p.term,
      name: p.name,
      consensusScore: p.count,
      category: category,
      adjPValueMedian: medianPvalue, // Keep the same name so we don't break existing ui code
      maxOverlap: maxOverlap,
      overlappingGenes: Array.from(p.allOverlappingGenes),
      pipelinesEnriched: `${p.count}/${numPipelines}`
    };
  });
  
  return results.sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    return a.adjPValueMedian - b.adjPValueMedian;
  });
}
