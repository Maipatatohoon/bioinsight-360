/**
 * Compute PCA on a matrix using the Gram matrix (dual PCA) approach.
 *
 * The standard (primal) PCA builds an nGenes × nGenes covariance matrix,
 * which is catastrophic for typical RNA-seq data (e.g. 15,000 genes →
 * 225 million elements, ~1.8 GB). Dual PCA instead builds the much smaller
 * nSamples × nSamples Gram matrix K = X · Xᵀ, then recovers principal
 * component scores from K's eigenvectors. This is efficient whenever
 * nSamples ≪ nGenes.
 *
 * Algorithm:
 *   1. Center the data (subtract per-gene / per-column mean).
 *   2. Compute the Gram matrix K = centeredData · centeredDataᵀ  (nSamples × nSamples).
 *   3. Extract top eigenvectors/eigenvalues of K via power iteration + deflation.
 *   4. Recover PC scores: score_c = X_centered^T · u_c (gene-space eigenvector),
 *      then project samples: PC_c[i] = Σ_j X_centered[i][j] · score_c[j].
 *      Equivalently, PC scores per sample are √λ · u (the Gram eigenvector
 *      scaled by √eigenvalue), which is what we return.
 *   5. Variance explained = eigenvalue_c / Σ(eigenvalues).
 *
 * @param {Array<Array<number>>} matrix - Input data: samples (rows) × genes (columns).
 * @param {number} [nComponents=2] - Number of principal components to retain.
 * @returns {{
 *   components: Array<Array<number>>,
 *   varianceExplained: Array<number>,
 *   loadings: null
 * }} An object with:
 *   - `components[c][i]`: score of sample `i` on principal component `c`.
 *   - `varianceExplained[c]`: fraction of total variance captured by component `c`.
 *   - `loadings`: `null` (gene-space loadings are not computed in the dual approach
 *      to avoid allocating nGenes-length vectors; reconstruct them downstream if needed
 *      via loadings_c = Xᵀ · u_c / √λ_c).
 */
export function computePCA(matrix, nComponents = 2) {
  // ── Edge case: empty or degenerate input ──────────────────────────────
  if (!matrix || matrix.length === 0 || !matrix[0] || matrix[0].length === 0) {
    return { components: [], varianceExplained: [], loadings: null };
  }

  const nSamples = matrix.length;
  const nGenes = matrix[0].length;

  // With a single sample there is no variance to decompose.
  if (nSamples === 1) {
    const comps = Array.from({ length: Math.min(nComponents, 1) }, () => [0]);
    const varExp = comps.map(() => 0);
    return { components: comps, varianceExplained: varExp, loadings: null };
  }

  // ── Step 1: Center the data (subtract per-gene column mean) ───────────
  const colMeans = new Float64Array(nGenes); // typed array for speed
  for (let i = 0; i < nSamples; i++) {
    const row = matrix[i];
    for (let j = 0; j < nGenes; j++) {
      colMeans[j] += row[j];
    }
  }
  for (let j = 0; j < nGenes; j++) {
    colMeans[j] /= nSamples;
  }

  // Centered data stored as an array-of-Float64Arrays to reduce GC pressure.
  const centered = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    const row = matrix[i];
    const cRow = new Float64Array(nGenes);
    for (let j = 0; j < nGenes; j++) {
      cRow[j] = row[j] - colMeans[j];
    }
    centered[i] = cRow;
  }

  // ── Step 2: Build the Gram matrix K = X_centered · X_centeredᵀ ────────
  // K is symmetric and only nSamples × nSamples (e.g. 8 × 8 = 64 elements).
  const K = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    K[i] = new Float64Array(nSamples);
  }

  for (let i = 0; i < nSamples; i++) {
    const rowI = centered[i];
    // Diagonal element
    let dotII = 0;
    for (let g = 0; g < nGenes; g++) {
      dotII += rowI[g] * rowI[g];
    }
    K[i][i] = dotII;

    // Off-diagonal (exploit symmetry: compute once, store twice)
    for (let j = i + 1; j < nSamples; j++) {
      const rowJ = centered[j];
      let dot = 0;
      for (let g = 0; g < nGenes; g++) {
        dot += rowI[g] * rowJ[g];
      }
      K[i][j] = dot;
      K[j][i] = dot;
    }
  }

  // ── Compute total variance from the Gram matrix ───────────────────────
  // Trace(K) = Σ_i ||x_i - mean||² which equals (nSamples-1) * total_variance
  // when using the unbiased estimator. We keep the raw trace and normalise at
  // the end so eigenvalue ratios remain correct.
  let traceK = 0;
  for (let i = 0; i < nSamples; i++) {
    traceK += K[i][i];
  }

  // All-zero data (every gene has zero variance) → no meaningful PCs.
  if (traceK === 0) {
    const nComp = Math.min(nComponents, nSamples);
    const comps = Array.from({ length: nComp }, () => new Array(nSamples).fill(0));
    const varExp = new Array(nComp).fill(0);
    return { components: comps, varianceExplained: varExp, loadings: null };
  }

  // ── Step 3: Power iteration with deflation on K ───────────────────────
  // We extract up to min(nComponents, nSamples-1) eigenvectors because the
  // rank of the centered Gram matrix is at most nSamples - 1 (centering
  // removes one degree of freedom).
  const maxComponents = Math.min(nComponents, nSamples - 1);
  const MAX_ITER = 200;
  const CONV_THRESHOLD = 1e-10;

  /** @type {Array<Float64Array>} Eigenvectors of K (length nSamples each) */
  const eigenvectors = [];
  /** @type {number[]} Eigenvalues of K */
  const eigenvalues = [];

  // Work on a mutable copy of K so deflation doesn't corrupt the original.
  const Kwork = new Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    Kwork[i] = new Float64Array(K[i]); // copy row
  }

  for (let c = 0; c < maxComponents; c++) {
    // Initialise with a deterministic vector (1, 2, 3, …) to keep results
    // reproducible. Any non-zero vector that isn't orthogonal to the dominant
    // eigenvector will converge.
    let v = new Float64Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      v[i] = i + 1;
    }
    let norm = vecNorm(v);
    vecScale(v, 1 / norm);

    let eigenvalue = 0;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      // Multiply: w = Kwork · v
      const w = new Float64Array(nSamples);
      for (let i = 0; i < nSamples; i++) {
        const kRow = Kwork[i];
        let sum = 0;
        for (let j = 0; j < nSamples; j++) {
          sum += kRow[j] * v[j];
        }
        w[i] = sum;
      }

      norm = vecNorm(w);
      if (norm === 0) {
        // Remaining subspace is null → eigenvalue is zero.
        break;
      }
      vecScale(w, 1 / norm);

      // Rayleigh quotient: λ = vᵀ K v (using the new v = w).
      let ev = 0;
      for (let i = 0; i < nSamples; i++) {
        const kRow = Kwork[i];
        let rowDot = 0;
        for (let j = 0; j < nSamples; j++) {
          rowDot += kRow[j] * w[j];
        }
        ev += w[i] * rowDot;
      }

      const diff = Math.abs(ev - eigenvalue);
      eigenvalue = ev;
      v = w;

      if (diff < CONV_THRESHOLD) {
        break;
      }
    }

    eigenvectors.push(v);
    eigenvalues.push(Math.max(eigenvalue, 0)); // clamp negative numerical noise

    // ── Deflate: remove this component's contribution from Kwork ───────
    // Kwork ← Kwork - λ · v · vᵀ
    for (let i = 0; i < nSamples; i++) {
      const vi = v[i];
      const kRow = Kwork[i];
      for (let j = 0; j < nSamples; j++) {
        kRow[j] -= eigenvalue * vi * v[j];
      }
    }
  }

  // ── Step 4: Compute PC scores per sample ──────────────────────────────
  // In dual PCA the relationship between the Gram eigenvector u_c (length
  // nSamples) and the primal PC scores is:
  //
  //   PC_c[i] = √λ_c · u_c[i]
  //
  // This gives each sample its coordinate on principal component c.
  const components = new Array(eigenvalues.length);
  for (let c = 0; c < eigenvalues.length; c++) {
    const scale = Math.sqrt(eigenvalues[c]);
    const u = eigenvectors[c];
    const scores = new Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      scores[i] = scale * u[i];
    }
    components[c] = scores;
  }

  // ── Step 5: Variance explained ────────────────────────────────────────
  // Each eigenvalue of K is proportional to the variance along that PC.
  // Fraction = λ_c / Σ λ.  We use traceK as Σ λ (sum of all eigenvalues
  // equals the trace of K).
  const varianceExplained = eigenvalues.map((ev) => traceK === 0 ? 0 : (ev / traceK) * 100);

  return { components, varianceExplained, loadings: null };
}

// ── Helper utilities ──────────────────────────────────────────────────────

/**
 * Euclidean (L2) norm of a Float64Array.
 * @param {Float64Array} v
 * @returns {number}
 */
function vecNorm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * In-place scalar multiplication: v ← v * s.
 * @param {Float64Array} v
 * @param {number} s
 */
function vecScale(v, s) {
  for (let i = 0; i < v.length; i++) {
    v[i] *= s;
  }
}
