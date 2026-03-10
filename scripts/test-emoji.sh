#!/bin/bash
# Test script for emoji action API
# Usage: ./scripts/test-emoji.sh [channel_id]

BASE_URL="${PIXEL_TOWN_API:-http://localhost:3800}"
CHANNEL_ID="${1:-default}"

echo "=== Emoji Action Test Script ==="
echo "Base URL: $BASE_URL"
echo "Channel: $CHANNEL_ID"
echo ""

# Get agents in channel
echo "1. Getting agents in channel..."
AGENTS=$(curl -s "$BASE_URL/channels/$CHANNEL_ID/agents")
echo "$AGENTS" | jq -r '.[] | "  - \(.name) (\(.botId))"' 2>/dev/null || echo "  No agents found"
echo ""

# Extract first two bot IDs
BOT_A=$(echo "$AGENTS" | jq -r '.[0].botId // empty')
BOT_B=$(echo "$AGENTS" | jq -r '.[1].botId // empty')

if [ -z "$BOT_A" ]; then
  echo "Error: No bots found in channel. Join some bots first."
  exit 1
fi

echo "2. Testing broadcast emoji (no target)..."
RESP=$(curl -s -X POST "$BASE_URL/channels/$CHANNEL_ID/action" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_A\",\"type\":\"emoji\",\"emoji\":\"wave\"}")
echo "   Response: $RESP"
echo ""

if [ -n "$BOT_B" ]; then
  echo "3. Testing targeted emoji ($BOT_A -> $BOT_B)..."
  RESP=$(curl -s -X POST "$BASE_URL/channels/$CHANNEL_ID/action" \
    -H 'Content-Type: application/json' \
    -d "{\"botId\":\"$BOT_A\",\"type\":\"emoji\",\"emoji\":\"coffee\",\"targetBotId\":\"$BOT_B\"}")
  echo "   Response: $RESP"
  echo ""
fi

echo "4. Testing all emoji types..."
EMOJIS="thumbs_up celebration coffee fire idea laugh wave thinking sparkles rocket"
for emoji in $EMOJIS; do
  RESP=$(curl -s -X POST "$BASE_URL/channels/$CHANNEL_ID/action" \
    -H 'Content-Type: application/json' \
    -d "{\"botId\":\"$BOT_A\",\"type\":\"emoji\",\"emoji\":\"$emoji\"}")
  DISPLAY=$(echo "$RESP" | jq -r '.emojiDisplay // "error"')
  echo "   $emoji -> $DISPLAY"
  sleep 0.2
done
echo ""

echo "5. Testing error cases..."
echo "   Invalid emoji:"
curl -s -X POST "$BASE_URL/channels/$CHANNEL_ID/action" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_A\",\"type\":\"emoji\",\"emoji\":\"invalid\"}" | head -c 100
echo ""
echo "   Missing emoji field:"
curl -s -X POST "$BASE_URL/channels/$CHANNEL_ID/action" \
  -H 'Content-Type: application/json' \
  -d "{\"botId\":\"$BOT_A\",\"type\":\"emoji\"}" | jq -r '.error // .'
echo ""

echo "=== Test Complete ==="
