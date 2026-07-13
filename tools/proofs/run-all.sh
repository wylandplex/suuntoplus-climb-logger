#!/usr/bin/env bash

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

proofs=(
  tools/proofs/f1-undeclared-project-keys.js
  tools/proofs/f2-system-switch-overwrite.js
  tools/proofs/f4-migration-authorizes-clobber.js
  tools/proofs/f5-partial-write-rollback.js
  tools/proofs/f7-uncapped-retries.js
  tools/proofs/f8-deploy-archives.js
  tools/proofs/f9-folded-edit-lie.js
  tools/proofs/f10-dead-lifetime-records.js
  tools/proofs/f11-edit-best-time.js
  tools/proofs/f12-paused-lap.js
)

bad=0
for proof in "${proofs[@]}"; do
  echo "===== $proof"
  output="$(node "$proof" 2>&1)"
  code=$?
  printf '%s\n' "$output"
  banner="$(printf '%s\n' "$output" | tail -n 1)"
  case "$banner:$code" in
    PROVEN:*:1|REFUTED:*:0|INCONCLUSIVE:*:2) ;;
    *)
      echo "HARNESS ERROR: banner/exit mismatch for $proof (exit=$code)"
      bad=1
      ;;
  esac
done

exit "$bad"

