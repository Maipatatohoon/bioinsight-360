import { runGOEnrichment, computePathwayConsensus } from '../lib/enrichment.js';

describe('Enrichment Library', () => {
  test('runGOEnrichment filters correctly and calculates enrichment', () => {
    const allGenes = ['GENE1', 'GENE2', 'GENE3', 'GENE4', 'GENE5', 'GENE6', 'GENE7', 'GENE8', 'GENE9', 'GENE10'];
    const degList = ['GENE1', 'GENE2', 'GENE3'];
    
    const goAnnotations = [
      { term: 'GO:0001', name: 'Path 1', genes: ['GENE1', 'GENE2', 'GENE3', 'GENE4'] }, // Overlap 3
      { term: 'GO:0002', name: 'Path 2 (Small)', genes: ['GENE1', 'GENE2'] }, // Filtered (size < 3)
      { term: 'GO:0003', name: 'Path 3 (Massive)', genes: new Array(501).fill('GENE1') } // Filtered
    ];
    
    const results = runGOEnrichment(degList, goAnnotations, allGenes);
    
    expect(results.length).toBe(1);
    expect(results[0].term).toBe('GO:0001');
    expect(results[0].overlap).toBe(3);
    expect(results[0].termGeneCount).toBe(4);
  });

  test('computePathwayConsensus aggregates scores across pipelines', () => {
    const pipe1 = [
      { term: 'GO:001', name: 'A', padj: 0.01, overlap: 5, overlappingGenes: ['G1'] },
      { term: 'GO:002', name: 'B', padj: 0.10, overlap: 2, overlappingGenes: ['G2'] }
    ];
    const pipe2 = [
      { term: 'GO:001', name: 'A', padj: 0.04, overlap: 4, overlappingGenes: ['G1'] }
    ];
    
    // 3 pipelines total to make sure denominator is correct
    const results = computePathwayConsensus([pipe1, pipe2, []], 0.05);
    
    expect(results.length).toBe(2);
    
    const go1 = results.find(r => r.term === 'GO:001');
    expect(go1.consensusScore).toBe(2); // significant in 2
    expect(go1.pipelinesEnriched).toBe('2/3');
    
    const go2 = results.find(r => r.term === 'GO:002');
    expect(go2.consensusScore).toBe(0); // not significant (< 0.05) in any
  });
});
