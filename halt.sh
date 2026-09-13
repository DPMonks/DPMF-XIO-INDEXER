#!/bin/bash
# Halt all DPMF‑XDX services on Railway

echo "🔴 Halting all services..."

# Indexer
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"STOP"}' \
  https://production.api.railway.app/v2/service/e89124ab-65d0-4f14-adb0-3b5ecb9eede9/action

# Worker 2
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"STOP"}' \
  https://production.api.railway.app/v2/service/c700627a-8b2a-4b2e-a6d4-6d885d36cd6e/action

# Worker 3
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"STOP"}' \
  https://production.api.railway.app/v2/service/c5c57b89-b492-4223-aff4-839498223f76/action

# Worker 4
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"STOP"}' \
  https://production.api.railway.app/v2/service/d6ee927a-9f71-4a35-a630-5b367a9d6a49/action

echo "🛑 Halt complete — cool‑down begins."
