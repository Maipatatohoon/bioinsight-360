# Running BioInsight 360 without Colab (local demo)

This is the fallback path that runs the whole stack on this machine. No Colab,
no tunnel, no worker, no Google login.

## One-time setup (~410 MB download, 5–10 min)

```bash
bash scripts/setup-local-r.sh
```

Installs R, DESeq2, edgeR, limma, argparse and the Python backend dependencies
into `~/micromamba/envs/bioinsight`. No `sudo`.

## Start everything

```bash
bash scripts/start-local.sh
```

Starts the backend on `localhost:8000` (local R runtime) and the frontend on
`localhost:3000`, then prints the URL.

Open in Firefox:

```
http://localhost:3000/?backend=http://localhost:8000
```

The `?backend=` parameter saves the backend URL in the browser and is removed
from the address bar. After the first visit, `http://localhost:3000` alone is
enough.

## Demo flow

1. **Upload** → *Load Demo Data* → *Continue*.
2. **QC** should finish and show 8 samples.
3. **Results** shows DESeq2 and edgeR as soon as each finishes. Open each tab
   independently; the comparison is optional and only becomes available when both
   saved tables exist. limma-voom is an optional third view.
4. **Pathways** calls g:Profiler from the browser (network required).
5. **Export** downloads the tables.

## Use it from another device on the same Wi-Fi

1. Find the LAN IP: `hostname -I | awk '{print $1}'` (currently `192.168.31.108`).
2. Open `http://<LAN-IP>:3000/?backend=http://<LAN-IP>:8000`.

The backend allows all origins, so this works without extra configuration.
The backend URL must be reachable from the *viewing* device — `localhost` on
the phone points at the phone, not at this machine.

## Stop

```bash
bash scripts/stop-local.sh
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Address already in use` on 8000 | `pkill -f "uvicorn app.main:app"` then rerun |
| `R environment missing` | run `bash scripts/setup-local-r.sh` again |
| Job fails with `object 'condition' not found` | caller sent no usable grouping column; send `condition_col`, `control_group`, `treated_group` and `design='~ condition'` |
| Job fails with `object 'Group' not found` | old backend + new caller mismatch; update the backend (`git -C ~/bioinsight-backend pull`) |
| Site shows "backend offline" | open the `?backend=http://localhost:8000` URL once to reset the saved URL |
| Port 3000 is stale | `bash scripts/stop-local.sh` then `bash scripts/start-local.sh` |

Logs: `/tmp/opencode/local-backend.log` and `/tmp/opencode/bioinsight-dev.log`.
