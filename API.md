# BioInsight 360 Backend REST API Documentation

Base URL: `http://localhost:8000` (or your active `https://xxxx.ngrok-free.app` URL).

---

## Endpoints

### 1. Health Check
`GET /health`

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "bioinsight-backend"
}
```

---

### 2. Dataset Profiling
`POST /api/profile`

**Content-Type:** `multipart/form-data`  
**Body:** `file` (CSV or TSV format)

**Response (200 OK):**
```json
{
  "total_genes": 20000,
  "total_samples": 6,
  "columns_detected": ["Gene", "Control_1", "Control_2", "Treated_1", "Treated_2"],
  "inferred_metadata_columns": {"condition": "treatment"},
  "analysis_units": [
    {
      "unit_id": "unit_1",
      "organism": "Homo sapiens",
      "contrast": "condition_Treated_vs_Control",
      "samples": ["Control_1", "Control_2", "Treated_1", "Treated_2"],
      "is_raw_counts": true
    }
  ],
  "warnings": []
}
```

---

### 3. Submit Analysis Job (Async)
`POST /api/analysis`

**Content-Type:** `application/json`  
**Body:**
```json
{
  "counts": {
    "Gene_1": {"Control_1": 100, "Control_2": 110, "Treated_1": 450, "Treated_2": 480}
  },
  "metadata": {
    "Control_1": {"condition": "Control"},
    "Control_2": {"condition": "Control"},
    "Treated_1": {"condition": "Treated"},
    "Treated_2": {"condition": "Treated"}
  },
  "params": {
    "design": "~ condition",
    "contrast": "condition_Treated_vs_Control"
  }
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "state": "QUEUED",
  "message": "Analysis job submitted successfully. Poll GET /api/analysis/{job_id} for progress."
}
```

---

### 4. Get Job Status
`GET /api/analysis/{job_id}`

**Response (200 OK):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "state": "ANALYZING",
  "progress": 60,
  "message": "Executing edgeR TMM normalization & Quasi-Likelihood F-test...",
  "warnings": [],
  "error": null,
  "created_at": 1727800000.0,
  "updated_at": 1727800005.0
}
```

---

### 5. Get Job Results
`GET /api/analysis/{job_id}/results`

**Response (200 OK):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "warnings": [],
  "results": {
    "deseq2": [
      {
        "Gene": "Gene_1",
        "log2FoldChange": 2.15,
        "baseMean": 285.0,
        "stat": 6.42,
        "pvalue": 0.0001,
        "padj": 0.0012
      }
    ],
    "edger": [...],
    "limma": [...]
  }
}
```

---

### 6. Download Results CSV
`GET /api/analysis/{job_id}/files?engine=deseq2`

**Response (200 OK):** `text/csv` stream with header `Content-Disposition: attachment; filename=bioinsight_deseq2_results_550e8400.csv`
