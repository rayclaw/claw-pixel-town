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

# State cycle simulation
STATES=("researching" "writing" "executing" "syncing" "idle" "researching" "writing" "error" "idle")
DETAILS=(
  "Reading codebase"
  "Implementing feature"
  "Running test suite"
  "Pushing to remote"
  "Waiting for input"
  "Analyzing logs"
  "Fixing bug"
  "Build failed: missing dep"
  "Ready for next task"
)

STEP=3
for i in "${!STATES[@]}"; do
  STATE="${STATES[$i]}"
  DETAIL="${DETAILS[$i]}"
  echo "$STEP. Push state: $STATE..."
  curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/push" \
    -H 'Content-Type: application/json' \
    -d "{\"botId\":\"$BOT_ID\",\"state\":\"$STATE\",\"detail\":\"$DETAIL\"}" | jq .
  echo ""
  STEP=$((STEP + 1))
  sleep 3
done

# List channel agents
echo "$STEP. List channel agents..."
curl -s "$API_BASE/channels/$CHANNEL_ID/agents" | jq .
echo ""
STEP=$((STEP + 1))

# Leave channel
echo "$STEP. Leaving channel..."
curl -s -X POST "$API_BASE/channels/$CHANNEL_ID/leave" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_ID\"}" | jq .
echo ""

echo "=== Test Complete ==="
