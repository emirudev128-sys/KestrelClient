#!/usr/bin/env bash
# Security sweep. Run from the project root:  bash tools/scan.sh
set -uo pipefail
# semgrep installs to the per-user scripts dir on Windows; point PATH at yours
export PATH="$(python -c 'import sysconfig,os;print(os.path.join(os.path.dirname(sysconfig.get_path("purelib")),"Scripts"))' 2>/dev/null):$HOME/AppData/Roaming/Python/Python314/Scripts:$PATH"
fail=0

echo "═══ 1. Electronegativity (Electron misconfiguration) ═══"
npx --yes @doyensec/electronegativity -i . 2>/dev/null \
  | grep -vE "Could not retrieve|^$" | tail -25 || true

echo
echo "═══ 2. Semgrep (JS + secrets) ═══"
semgrep --config=p/javascript --config=p/secrets --config=p/nodejs \
  --exclude=node_modules --exclude=shots --exclude=ref --exclude=variants \
  --quiet --metrics=off . 2>&1 | tail -30 || true

echo
echo "═══ 3. npm audit ═══"
npm audit --omit=dev 2>&1 | tail -3

echo
echo "═══ 4. Token containment (project-specific) ═══"
echo "-- token-ish values reaching console/log/Error --"
grep -rnE "(console\.(log|error|warn)|throw new Error|say\()[^)]*(access_?[Tt]oken|refresh_?[Tt]oken|device_?code|id_?token|\.token\b)" \
  --include=*.js --exclude-dir=node_modules . | grep -v "tools/scan" || echo "   none"
echo "-- tokens crossing the contextBridge --"
grep -nE "token|secret|credential" preload.js 2>/dev/null || echo "   none in preload.js"
echo "-- plaintext persistence of a token --"
grep -rnE "writeFile.*([Tt]oken|credential)|JSON\.stringify\([^)]*[Tt]oken" \
  --include=*.js --exclude-dir=node_modules . | grep -vE "safeStorage|encryptString|tools/scan" || echo "   none"
echo "-- TLS verification disabled anywhere --"
grep -rnE "rejectUnauthorized *: *false|NODE_TLS_REJECT_UNAUTHORIZED" \
  --include=*.js --exclude-dir=node_modules . || echo "   none"
echo "-- token on a command line --"
grep -rnE "accessToken.*(spawn|exec|args)|args.*--accessToken" \
  --include=*.js --exclude-dir=node_modules . || echo "   none"

echo
echo "═══ 5. Electron hardening flags ═══"
grep -nE "contextIsolation|nodeIntegration|sandbox|webSecurity|allowRunningInsecureContent|experimentalFeatures" main.js 2>/dev/null || echo "   main.js not found"
