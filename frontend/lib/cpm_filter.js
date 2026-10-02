export function filterByCPM(matrix, geneNames, cpmThreshold, minSamples) {
  if (!matrix || matrix.length === 0) return { filteredMatrix: [], filteredGenes: [] };

  const numSamples = matrix[0].length;
  
  // 1. Calculate library sizes (total reads per sample)
  const libSizes = new Array(numSamples).fill(0);
  for (let g = 0; g < matrix.length; g++) {
    for (let s = 0; s < numSamples; s++) {
      libSizes[s] += matrix[g][s];
    }
  }

  const filteredMatrix = [];
  const filteredGenes = [];

  // 2. Filter genes
  for (let g = 0; g < matrix.length; g++) {
    let samplesPassing = 0;
    for (let s = 0; s < numSamples; s++) {
      if (libSizes[s] > 0) {
        const cpm = (matrix[g][s] / libSizes[s]) * 1000000;
        if (cpm >= cpmThreshold) {
          samplesPassing++;
        }
      }
    }
    
    // Keep gene if it meets CPM threshold in at least minSamples
    if (samplesPassing >= minSamples) {
      filteredMatrix.push([...matrix[g]]);
      filteredGenes.push(geneNames[g]);
    }
  }

  return { filteredMatrix, filteredGenes };
}

export function matrixToCSV(matrix, geneNames, sampleNames) {
  const header = ['Gene', ...sampleNames].join(',');
  const rows = matrix.map((row, i) => `${geneNames[i]},${row.join(',')}`);
  return [header, ...rows].join('\n');
}
