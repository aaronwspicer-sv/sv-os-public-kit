#!/usr/bin/env bash
# One-shot Hermes setup for Alfred — run this on your VPS or local machine.
# After running, add HERMES_BASE_URL and HERMES_API_KEY to your Vercel env vars.
set -euo pipefail

echo "── Installing Hermes Agent ──────────────────────────────"
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

echo ""
echo "── Configuring for Alfred ───────────────────────────────"
mkdir -p ~/.hermes
cp "$(dirname "$0")/cli-config.yaml" ~/.hermes/cli-config.yaml
echo "Config written to ~/.hermes/cli-config.yaml"

echo ""
echo "── Generating API key ───────────────────────────────────"
if [ -z "${HERMES_API_KEY:-}" ]; then
  export HERMES_API_KEY=$(openssl rand -hex 32)
  echo ""
  echo "  HERMES_API_KEY=${HERMES_API_KEY}"
  echo ""
  echo "  ↳ Add this to Vercel: vercel env add HERMES_API_KEY"
fi

echo ""
echo "── Starting Hermes gateway ──────────────────────────────"
echo "  Listening on http://0.0.0.0:8642"
echo "  Also add to Vercel: HERMES_BASE_URL=https://YOUR_HOST:8642/v1"
echo ""
OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" \
HERMES_API_KEY="${HERMES_API_KEY}" \
hermes gateway start
