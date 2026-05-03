#!/usr/bin/env bash
# Run auto_scanner with a predictable cwd — fixes WSL/Python import errors when
# the shell's pwd is stale, deleted, or otherwise not stat()-able.
set -euo pipefail
SELF="${BASH_SOURCE[0]:-$0}"
if command -v realpath >/dev/null 2>&1; then
  DIR="$(dirname "$(realpath "$SELF")")"
elif command -v readlink >/dev/null 2>&1; then
  DIR="$(dirname "$(readlink -f "$SELF")")"
else
  DIR="$(cd "$(dirname "$SELF")" && pwd -P)"
fi
cd "$DIR"
exec python3 "$DIR/main.py" "$@"
