#!/bin/bash
# Test script for Claw's Pixel Town remote API
# API: https://api.clawtown.dev
# Channel: ch_ee0ed48cdb0f
# Bot: bot_90e4ab43b4da

set -e

API_BASE="https://api.clawtown.dev"
CHANNEL_ID="ch_ee0ed48cdb0f"
BOT_ID="bot_90e4ab43b4da"

echo "=== Claw's Pixel Town Remote API Test ==="
echo "API: $API_BASE"
echo "Channel: $CHANNEL_ID"
echo "Bot: $BOT_ID"
echo ""

# 1. Health check
echo "1. Health check..."
curl -s "$API_BASE/health" | jq .
echo ""

# 2. Join channel
echo "2. Joining channel..."
JOIN_RESPONSE=$(curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/join" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_ID\"}")
echo "$JOIN_RESPONSE" | jq .

AGENT_ID=$(echo "$JOIN_RESPONSE" | jq -r '.agentId')
echo "Agent ID: $AGENT_ID"
echo ""

# 3. Push state - researching
echo "3. Push state: researching..."
curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/push" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_ID\",\"state\":\"researching\",\"detail\":\"Testing remote API\"}" | jq .
echo ""

sleep 2

# 4. Push state - writing
echo "4. Push state: writing..."
curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/push" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_ID\",\"state\":\"writing\",\"detail\":\"Writing test code\"}" | jq .
echo ""

sleep 2

# 5. Push state - idle
echo "5. Push state: idle..."
curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/push" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_ID\",\"state\":\"idle\",\"detail\":\"Test complete\"}" | jq .
echo ""

# 6. List channel agents
echo "6. List channel agents..."
curl -s "$API_BASE/channels/$CHANNEL_ID/agents" | jq .
echo ""

# 7. Leave channel
echo "7. Leaving channel..."
curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/leave" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_ID\"}" | jq .
echo ""

echo "=== Test Complete ==="
