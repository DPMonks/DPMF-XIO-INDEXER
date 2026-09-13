#!/bin/bash
# Resume all DPMF‑XDX services on Railway after cool‑down

echo "⏳ Waiting 60 minutes..."
sleep 3600

echo "🟢 Restarting services..."

# Indexer
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"START"}' \
  https://production.api.railway.app/v2/service/e89124ab-65d0-4f14-adb0-3b5ecb9eede9/action
sleep 10

# Worker 2
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"START"}' \
  https://production.api.railway.app/v2/service/c700627a-8b2a-4b2e-a6d4-6d885d36cd6e/action
sleep 10

# Worker 3
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"START"}' \
  https://production.api.railway.app/v2/service/c5c57b89-b492-4223-aff4-839498223f76/action
sleep 10

# Worker 4
curl -s -X POST \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"START"}' \
  https://production.api.railway.app/v2/service/d6ee927a-9f71-4a35-a630-5b367a9d6a49/action

echo "✅ All services restarted successfully."
