/**
 * Dynamic GO Biological Process annotation fetcher.
 * Queries EBI QuickGO API for real gene-to-pathway mappings.
 * Falls back to static go_annotations.json if API is unreachable.
 */

const QUICKGO_BASE = 'https://www.ebi.ac.uk/QuickGO/services/annotation/search';
const CACHE_KEY = 'goAnnotationsCache';
const BATCH_SIZE = 100;
const PAGE_SIZE = 100;
const RATE_LIMIT_MS = 200;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch GO BP annotations for a set of gene symbols from QuickGO.
 * @param {string[]} geneSymbols - Array of human gene symbols
 * @returns {Promise<Array<{term: string, name: string, genes: string[]}>>}
 */
export async function fetchGOAnnotationsForGenes(geneSymbols) {
  if (!geneSymbols || geneSymbols.length === 0) return [];

  // Check cache
  if (typeof sessionStorage !== 'undefined') {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.warn("Error parsing cached GO annotations", e);
      }
    }
  }

  const goMap = new Map(); // goId -> { term, name, genes: Set }

  try {
    // Process in batches
    for (let i = 0; i < geneSymbols.length; i += BATCH_SIZE) {
      const batch = geneSymbols.slice(i, i + BATCH_SIZE);
      const symbolString = batch.join(',');
      
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const url = `${QUICKGO_BASE}?geneProductType=protein&taxonId=9606&aspect=biological_process&geneProductSubset=Swiss-Prot&symbol=${symbolString}&limit=${PAGE_SIZE}&page=${page}`;
        
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`QuickGO API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.results) {
          for (const result of data.results) {
            if (!goMap.has(result.goId)) {
              goMap.set(result.goId, {
                term: result.goId,
                name: result.goName,
                genes: new Set()
              });
            }
            if (result.symbol) {
              goMap.get(result.goId).genes.add(result.symbol);
            }
          }
        }

        if (data.pageInfo && data.pageInfo.total) {
            totalPages = Math.ceil(data.pageInfo.total / PAGE_SIZE);
        } else {
            totalPages = 0;
        }
        
        page++;
        
        if (page <= totalPages) {
            await delay(RATE_LIMIT_MS);
        }
      }
      
      if (i + BATCH_SIZE < geneSymbols.length) {
          await delay(RATE_LIMIT_MS);
      }
    }

    // Filter and format
    const resultList = [];
    for (const data of goMap.values()) {
      const geneArray = Array.from(data.genes);
      if (geneArray.length >= 3 && geneArray.length <= 500) {
        resultList.push({
          term: data.term,
          name: data.name,
          genes: geneArray
        });
      }
    }

    // Cache the result
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(resultList));
    }

    return resultList;

  } catch (error) {
    console.error("Failed to fetch from QuickGO API, falling back to local data:", error);
    try {
      const fallbackRes = await fetch('/data/go_annotations.json');
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        return fallbackData;
      }
    } catch (fallbackError) {
      console.error("Failed to load fallback GO annotations:", fallbackError);
    }
    return [];
  }
}
