#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if ! command -v go >/dev/null 2>&1; then
  echo "go not found, skipping the go.mod drift check." >&2
  exit 0
fi

if ! go mod tidy -diff; then
  echo "go.mod/go.sum at the repo root are out of step with backend/go.mod." >&2
  echo "Run 'go mod tidy' at the repo root and commit the result." >&2
  exit 1
fi
