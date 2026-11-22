#!/usr/bin/env bash
# Build the Windows exe into dist/ and describe it in dist/version.json for the in-app updater.
# Usage: ./build_release.sh "что нового (коротко)"
# Before: bump AppVersion in main.go, v… in web/index.html and res/app.rc (+ rebuild the .syso, see README).
# After: commit dist/ to the repository's default branch — installed copies will offer the update.
set -euo pipefail
cd "$(dirname "$0")"
ver=$(sed -n 's/^var AppVersion = "\(.*\)"$/\1/p' main.go)
[ -n "$ver" ] || { echo "AppVersion not found in main.go" >&2; exit 1; }
mkdir -p dist
GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui -s -w" -o dist/PUFService.exe .
sum=$(sha256sum dist/PUFService.exe | cut -d' ' -f1)
size=$(wc -c < dist/PUFService.exe | tr -d ' ')
python3 -c 'import json,sys; print(json.dumps({"version": sys.argv[1], "sha256": sys.argv[2], "size": int(sys.argv[3]), "notes": sys.argv[4]}, ensure_ascii=False))' \
  "$ver" "$sum" "$size" "${1:-}" > dist/version.json
echo "$sum  PUFService.exe" > dist/SHA256SUMS.txt
echo "dist/PUFService.exe v$ver, $size bytes, sha256 $sum"
