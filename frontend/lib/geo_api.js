export async function fetchGeoMetadata(accession) {
  try {
    const isSRA = /^([SED]R[RPXS]|PRJNA|SAMN)/i.test(accession);
    const isGEO = /^GSE/i.test(accession);
    const isEBI = /^E-/i.test(accession);

    if (!isSRA && !isGEO && !isEBI) {
      throw new Error(`Invalid accession format "${accession}". Please use GEO (GSE...), SRA (SRR...), or EBI (E-...).`);
    }

    if (isSRA) {
      return await fetchSraMetadata(accession);
    }
    
    if (isEBI) {
      return await fetchEbiMetadata(accession);
    }

    // Default: GEO Fetching
    const targetUrl = `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${accession}&targ=self&form=xml&view=quick`;
    const proxyUrl = `/api/ncbi?url=${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Network response was not ok: ${response.status} - ${errText}`);
    }    
    // API route returns text directly since we proxy the content type
    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const errorNode = xmlDoc.querySelector("error");
    if (errorNode) {
      throw new Error(errorNode.textContent || "Unknown GEO error");
    }

    const title = xmlDoc.querySelector("Title")?.textContent || "No Title";
    const summary = xmlDoc.querySelector("Summary")?.textContent || "No Summary";
    const organism = xmlDoc.querySelector("Organism")?.textContent || "Unknown";

    const supplNodes = xmlDoc.querySelectorAll("Supplementary-Data");
    const supplFiles = [];
    
    supplNodes.forEach(node => {
      const type = node.getAttribute("type");
      let url = (node.textContent || "").trim();
      
      if (url.startsWith('ftp://')) {
        url = url.replace('ftp://', 'https://');
      }

      const isProcessable = url.endsWith('.txt.gz') || 
                            url.endsWith('.csv.gz') || 
                            url.endsWith('.tsv.gz') ||
                            url.endsWith('.txt') ||
                            url.endsWith('.csv') ||
                            url.endsWith('.tsv');

      if (url) {
        supplFiles.push({
          type,
          url,
          filename: url.split('/').pop(),
          isProcessable
        });
      }
    });

    return {
      source: 'GEO',
      title,
      summary,
      organism,
      supplFiles
    };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    throw error;
  }
}

async function fetchEbiMetadata(accession) {
  const targetUrl = `https://www.ebi.ac.uk/gxa/json/experiments/${accession}`;
  const proxyUrl = `/api/ncbi?url=${encodeURIComponent(targetUrl)}`;
  
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error('EBI Network error or experiment not found');
  
  const data = await response.json();
  const exp = data.experiment;
  
  if (!exp) {
    throw new Error('Could not parse EBI Expression Atlas response');
  }

  // Construct direct download link to the RNA-seq read counts
  const ebiDownloadLink = `https://www.ebi.ac.uk/gxa/experiments/${accession}/Downloads`;

  return {
    source: 'EBI',
    title: exp.description || "No Title",
    summary: `Species: ${exp.species}. Type: ${exp.type}`,
    organism: exp.species || "Unknown",
    supplFiles: [{
      type: 'EBI Processed Data',
      filename: `Download Count Matrices manually from EBI`,
      url: ebiDownloadLink,
      isProcessable: false
    }]
  };
}

async function fetchSraMetadata(accession) {
  // Step 1: Esearch
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=sra&term=${accession}[Accession]&retmode=json`;
  const proxySearchUrl = `/api/ncbi?url=${encodeURIComponent(searchUrl)}`;
  
  const searchRes = await fetch(proxySearchUrl);
  if (!searchRes.ok) throw new Error('Network error in SRA esearch');
  
  const searchData = await searchRes.json();
  
  const ids = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) {
    throw new Error(`SRA Accession ${accession} not found.`);
  }
  
  const uid = ids[0];

  // Step 2: Esummary
  const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=sra&id=${uid}&retmode=json`;
  const proxySumUrl = `/api/ncbi?url=${encodeURIComponent(sumUrl)}`;
  
  const sumRes = await fetch(proxySumUrl);
  if (!sumRes.ok) throw new Error('Network error in SRA esummary');
  
  const sumData = await sumRes.json();
  
  const record = sumData?.result?.[uid];
  if (!record || !record.expxml) {
    throw new Error("Invalid SRA record format");
  }

  // Esummary expxml is a string containing XML.
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(record.expxml, "text/xml");

  const title = xmlDoc.querySelector("Title")?.textContent || "No Title";
  const organism = xmlDoc.querySelector("Organism")?.getAttribute("ScientificName") || "Unknown";
  const platform = xmlDoc.querySelector("Platform")?.textContent || "Unknown Platform";
  const strategy = xmlDoc.querySelector("LIBRARY_STRATEGY")?.textContent || "Unknown Strategy";

  return {
    source: 'SRA',
    title,
    summary: `Raw sequencing data (FASTQ). Platform: ${platform}, Strategy: ${strategy}. BioInsight 360 does not perform raw FASTQ mapping locally. Please use institutional compute resources.`,
    organism,
    platform,
    strategy,
    supplFiles: [] // SRA has no processed matrices to import
  };
}
