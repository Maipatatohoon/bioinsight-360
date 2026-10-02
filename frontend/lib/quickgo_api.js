export async function fetchGoTermDetails(goId) {
  try {
    // Route through local proxy to bypass CORS/adblockers
    const targetUrl = `https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${encodeURIComponent(goId)}`;
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch GO term: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      throw new Error("GO term not found");
    }

    const term = data.results[0];
    
    return {
      id: term.id,
      name: term.name,
      definition: term.definition?.text || "No definition available",
      aspect: term.aspect,
      synonyms: term.synonyms?.map(s => s.name) || []
    };
  } catch (error) {
    console.error("QuickGO API error:", error);
    throw error;
  }
}
