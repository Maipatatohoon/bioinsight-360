/**
 * g:Profiler API integration for GO Enrichment Analysis
 */

export async function runGProfilerEnrichment(degs, background, organism = 'hsapiens') {
  if (!degs || degs.length === 0) return [];
  
  try {
    const response = await fetch('https://biit.cs.ut.ee/gprofiler/api/gost/profile/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        organism: organism,
        query: degs,
        sources: ["GO:BP", "KEGG", "REAC", "HP"],
        domain_scope: "custom_annotated",
        background: background,
        significance_threshold_method: "fdr",
        user_threshold: 0.05,
        no_evidences: false
      })
    });

    if (!response.ok) {
      throw new Error(`g:Profiler API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data || !data.result) return [];

    return data.result.map(res => {
      // Map g:Profiler response format to our application's format
      return {
        term: res.native,
        name: res.name,
        source: res.source, // Added source mapping (e.g. GO:BP, KEGG, REAC, HP)
        pvalue: res.p_value,
        padj: res.p_value, // g:Profiler returns FDR-corrected p-value by default when threshold_method="fdr"
        overlap: res.intersection_size,
        overlappingGenes: res.intersections ? res.intersections.map(i => degs[i]) : [],
        termGeneCount: res.term_size,
        expected: (degs.length * res.term_size) / background.length,
        enrichmentRatio: res.intersection_size / ((degs.length * res.term_size) / background.length)
      };
    });
  } catch (error) {
    console.error("g:Profiler enrichment failed:", error);
    return [];
  }
}
