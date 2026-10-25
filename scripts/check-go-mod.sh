#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if ! go mod tidy -diff; then
  echo "go.mod/go.sum at the repo root are out of step with backend/go.mod." >&2
  echo "Run 'go mod tidy' at the repo root and commit the result." >&2
  exit 1
fi
