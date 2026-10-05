# BioInsight 360 System Architecture & Engineering Specifications

## 1. System Design & Component Hierarchy

BioInsight 360 is engineered as a **decoupled microservice architecture**:

- **Presentation & Interaction Layer (Frontend):** Next.js (React) SSR/SPA framework deployed on Vercel Edge Networks. Responsible for UI layout, state management, interactive Plotly visualization, client-side DEG parsing, and polling job status.
- **Orchestration & Validation Layer (Backend API):** Python FastAPI web server running on containerized compute (Google Colab / Docker). Responsible for input profiling, scientific validation, background job tracking, and R subprocess invocation.
- **Statistical Execution Layer (R Microservices):** Isolated R scripts (`deseq2_script.R`, `edger_script.R`, `limma_script.R`) executing native Bioconductor algorithms.

---

## 2. Job Execution Lifecycle & State Machine

```text
[POST /api/analysis] ──► JobStore.create_job() ──► Return Job ID (202 Accepted)
                               │
                               ▼ (Background Worker Thread)
                         [VALIDATING]
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       Validation Failed             Validation Succeeded
               │                               │
        [State: FAILED]                [State: ANALYZING]
                                               │
                               ┌───────────────┼───────────────┐
                               ▼               ▼               ▼
                           DESeq2.R         edgeR.R         limma.R
                               │               │               │
                               └───────────────┼───────────────┘
                                               ▼
                                    [GENERATING_RESULTS]
                                               │
                                               ▼
                                      [State: COMPLETED]
```

### Job States:
1. `QUEUED`: Job received and registered in `JobStore`.
2. `VALIDATING`: Sanitizing input matrices, checking integer counts, checking replicate counts ($n \ge 2$), matching sample names.
3. `ANALYZING`: Executing DESeq2, edgeR, and limma-voom R scripts asynchronously via subprocesses.
4. `GENERATING_RESULTS`: Formatting output tables, serializing NaN values to JSON `null`, and generating consensus sets.
5. `COMPLETED`: Analysis complete. Results available via `GET /api/analysis/{job_id}/results`.
6. `FAILED`: Execution stopped due to validation or script error. Detailed scientific message stored in `job.error`.

---

## 3. Data Integrity & Security Safeguards

- **Input Sanitization:** Strips trailing spaces, validates file extensions (`.csv`, `.tsv`), replaces NaNs with zero, and removes special characters in sample names.
- **Integer Count Check:** Detects non-integer expression data (e.g. TPM/FPKM) and rounds to raw integer counts with a warning, preserving DESeq2 statistical assumptions.
- **No Shared Global State:** Job results are keyed by UUID4 and isolated in `JobStore`.
- **CORS & Environment Isolation:** Frontend communicates over HTTPS/WSS via configurable `NEXT_PUBLIC_BACKEND_URL` or custom user-provided Colab ngrok endpoint.
