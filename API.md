# BioInsight 360 Backend REST API

Base URL: `http://localhost:8000` (or the active Colab/Cloudflare tunnel URL).

All analysis endpoints are asynchronous. DESeq2 and edgeR are the two core methods;
limma-voom is optional. A result table is available as soon as that method finishes,
without waiting for the other method or a comparison.

## 1. Health check

`GET /health`

```json
{"status": "healthy", "service": "bioinsight-backend"}
```

## 2. Submit an analysis job

`POST /api/analysis` — `multipart/form-data`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `counts_file` | file | yes | Gene-level raw integer count matrix (CSV/TSV). |
| `metadata_file` | file | yes | Sample metadata with a sample ID column and a group/condition column. |
| `params` | JSON string | yes | Design and contrast parameters; must include distinct `control_group` and `treated_group`. |

```json
{
  "design": "~ condition",
  "control_group": "Control",
  "treated_group": "Treated",
  "condition_col": "Group"
}
```

The backend validates raw integer counts and rejects TPM/FPKM-like,
non-integer, negative, infinite or missing values (missing counts are **not**
imputed as zero). It rejects duplicate sample IDs, requires at least two
replicates per selected group, and verifies that every selected control/treatment
sample appears in both files. `control_group` and `treated_group` are required at
submission. Contract direction is `treated_group` vs `control_group`; the R scripts
receive those levels explicitly and do not parse them out of a combined string.

Response `202 Accepted`:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "state": "VALIDATING",
  "message": "Analysis job submitted successfully. Poll GET /api/analysis/{job_id} for progress."
}
```

## 3. Get job status

`GET /api/analysis/{job_id}`

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "state": "RUNNING",
  "progress": 58,
  "message": "edger completed.",
  "warnings": [],
  "error": null,
  "created_at": 1727800000.0,
  "updated_at": 1727800005.0,
  "params": {
    "design": "~ condition",
    "control_group": "Control",
    "treated_group": "Treated"
  },
  "methods": {
    "deseq2": {"status": "completed", "error": null, "rows": 198, "updated_at": 1727800002.0},
    "edger": {"status": "completed", "error": null, "rows": 191, "updated_at": 1727800005.0},
    "limma": {"status": "pending", "error": null, "rows": 0, "updated_at": null}
  },
  "results_available": ["deseq2", "edger"],
  "comparison_available": false,
  "qc_data": {"sampleNames": ["..."], "pcaResult": {"...": "..."}}
}
```

Method statuses: `pending`, `running`, `completed`, `failed`.

Terminal job states:

- `COMPLETED` — both DESeq2 and edgeR produced non-empty tables. limma may be
  present or may still be `pending` if it was not run.
- `PARTIALLY_COMPLETED` — exactly one core method produced a table. The successful
  method remains fully available and the failed method keeps its own error.
- `FAILED` — neither core method produced a table.
- `CANCELLED` / `WORKER_DISCONNECTED` — operational states.

The status response never embeds the large result tables.

## 4. Get partial or complete results

`GET /api/analysis/{job_id}/results`

Returns every table saved so far. `status` is `pending` (no tables yet),
`partial` (one core method or a non-terminal job), or `success` (both core
methods complete).

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "partial",
  "state": "RUNNING",
  "methods": {"deseq2": {"status": "completed"}, "edger": {"status": "running"}},
  "warnings": [],
  "error": null,
  "results": {
    "deseq2": [
      {
        "Gene": "CRISPLD2",
        "baseMean": 10093.7,
        "log2FoldChange": 2.045,
        "lfcSE": 0.14,
        "stat": 14.63,
        "pvalue": 1.83e-48,
        "padj": 3.63e-46
      }
    ]
  }
}
```

## 5. Get one method

`GET /api/analysis/{job_id}/method/{engine}`

Allowed engines: `deseq2`, `edger`, `limma`.

Returns `200` with `{job_id, engine, state, methods, warnings, results}` when that
method has a saved table. Returns `404` with a message such as
`"edger results are not available yet (status: running)."` otherwise. This is the
endpoint the individual DESeq2/edgeR tabs use.

## 6. Download a method CSV

`GET /api/analysis/{job_id}/files?engine=deseq2`

Returns `text/csv` with `Content-Disposition: attachment` for the saved table.
It does not recompute anything.

## 7. Optional comparison

The comparison is computed from the **saved** DESeq2 and edgeR tables. It never
re-runs R and cannot run until both core result tables exist.

### Create/replace the comparison

`POST /api/analysis/{job_id}/comparison`

```json
{"padj_threshold": 0.05, "log2fc_threshold": 1.0}
```

Returns `409` if either saved table is missing. The result is stored on the job so
a page refresh does not recalculate it.

```json
{
  "status": "success",
  "comparison": {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": 1727800010.0,
    "parameters": {
      "padj_threshold": 0.05,
      "log2fc_threshold": 1.0,
      "significance_metric": "adjusted p-value (BH FDR); raw p-values are reported but never used for significance when padj is unavailable"
    },
    "summary": {
      "genes_compared": 198,
      "shared_significant": 9,
      "deseq2_only": 0,
      "edger_only": 0,
      "direction_agree": 9,
      "direction_disagree": 0,
      "consensus": 9,
      "consensus_up": 9,
      "consensus_down": 0
    },
    "rows": [
      {
        "gene": "CRISPLD2",
        "deseq2_log2fc": 2.045,
        "deseq2_padj": 3.63e-46,
        "deseq2_significant": true,
        "edger_log2fc": 2.041,
        "edger_padj": 5.09e-12,
        "edger_significant": true,
        "direction_agreement": "agree",
        "consensus": true
      }
    ]
  }
}
```

**Consensus rule:** significant in both methods at the stated adjusted-p-value
and fold-change thresholds **and** the same direction. A raw p-value is never
substituted for a missing adjusted p-value. Method-specific genes remain visible
as `deseq2_only` or `edger_only`; opposite directions are `direction_agreement:
"disagree"` and are not consensus.

### Read the saved comparison

`GET /api/analysis/{job_id}/comparison` — `200` with the saved object, or `404`
if none has been created.

### Download comparison CSV

`GET /api/analysis/{job_id}/comparison.csv` — `text/csv` of the saved comparison
rows.

## 8. Worker protocol (bearer token required)

Set `Authorization: Bearer <BIOINSIGHT_WORKER_TOKEN>`.

| Endpoint | Purpose |
|---|---|
| `POST /api/workers/register` | Register a worker and start heartbeats. |
| `POST /api/workers/heartbeat` | Keep the claim alive. |
| `GET /api/workers/jobs/next` | Fetch the next queued job. |
| `POST /api/workers/jobs/{job_id}/claim` | Atomically claim a job. |
| `GET /api/workers/jobs/{job_id}/dataset/counts` | Download the cleaned count matrix. |
| `GET /api/workers/jobs/{job_id}/dataset/metadata` | Download the cleaned metadata. |
| `POST /api/workers/jobs/{job_id}/method/{engine}` | Report `running`, then `completed` with that method's table, or `failed` with its error. |
| `POST /api/workers/jobs/{job_id}/finish` | Finalise the job without re-sending the tables. |
| `POST /api/workers/jobs/{job_id}/results` | Legacy all-at-once fallback. |
| `POST /api/workers/jobs/{job_id}/failed` | Mark the whole job failed before any core result exists. |

The worker uploads each method immediately. If an incremental upload cannot be
persisted, it falls back to the legacy aggregate upload for that and the remaining
engines, so a successful table is not silently lost.

## 9. Legacy endpoints

Synchronous result upload endpoints remain for backwards compatibility. New
clients should use the job + per-method protocol above.
