#!/usr/bin/env bash
# One-time setup: R + Bioconductor + Python backend deps in your home directory.
# No sudo, no system packages, no Colab.
set -o pipefail

export MAMBA_ROOT_PREFIX="${MAMBA_ROOT_PREFIX:-$HOME/micromamba}"
ENV_PREFIX="${ENV_PREFIX:-$MAMBA_ROOT_PREFIX/envs/bioinsight}"
MAMBA="${MAMBA:-$HOME/.local/bin/micromamba}"

if [ ! -x "$MAMBA" ]; then
  echo "micromamba not found at $MAMBA"
  echo "Install it with:"
  echo '  curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest | tar -xvj -C "$HOME/.local" bin/micromamba'
  exit 1
fi

echo "== [1/3] micromamba env (binary packages, no compilation) =="
"$MAMBA" create -y -p "$ENV_PREFIX" -c conda-forge -c bioconda \
  python=3.11 \
  r-base \
  r-argparse \
  bioconductor-deseq2 \
  bioconductor-edger \
  bioconductor-limma || { echo "ENV_CREATE_FAILED"; exit 10; }

echo "== [2/3] python packages =="
"$ENV_PREFIX/bin/python" -m pip install -q --upgrade pip
"$ENV_PREFIX/bin/python" -m pip install -q \
  fastapi "uvicorn[standard]" pandas numpy python-multipart \
  pydantic scikit-learn scipy httpx requests || { echo "PIP_FAILED"; exit 11; }

echo "== [3/3] verification =="
"$ENV_PREFIX/bin/Rscript" -e 'for (p in c("DESeq2","edgeR","limma","argparse")) cat(p, requireNamespace(p, quietly=TRUE), "\n")'
"$ENV_PREFIX/bin/python" -c 'import fastapi, uvicorn, pandas, numpy, sklearn, scipy, requests; print("python imports OK")'

echo "SETUP_DONE"
