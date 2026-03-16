#!/bin/bash
# Test script for RPS game flow
# Usage: ./scripts/test-rps-game.sh
# Environment variables:
#   API_BASE   - API server URL (default: http://localhost:3800)
#   CHANNEL_ID - Channel to play in (default: default)
#   THINK_TIME - Seconds to pause between actions (default: 2)
#   BOT1_ID    - Real botId for player 1 (required)
#   BOT2_ID    - Real botId for player 2 (required)
#
# Example:
#   BOT1_ID=bot_abc123 BOT2_ID=bot_def456 ./scripts/test-rps-game.sh

set -e

API_BASE="${API_BASE:-http://localhost:3800}"
CHANNEL_ID="${CHANNEL_ID:-default}"

echo "=== RPS Game Test Script ==="
echo "API: $API_BASE"
echo "Channel: $CHANNEL_ID"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check required environment variables
if [ -z "$BOT1_ID" ] || [ -z "$BOT2_ID" ]; then
    echo -e "${RED}Error: BOT1_ID and BOT2_ID environment variables are required${NC}"
    echo ""
    echo "Usage:"
    echo "  BOT1_ID=bot_xxx BOT2_ID=bot_yyy ./scripts/test-rps-game.sh"
    echo ""
    echo "You can find your bot IDs in the database or by creating bots via the UI."
    echo "Note: The alias (player_xxx) shown in the UI is NOT the real botId."
    echo ""
    echo "To find real bot IDs:"
    echo "  sqlite3 star-office.db 'SELECT bot_id, name FROM bots'"
    exit 1
fi

echo -e "${GREEN}Using bots:${NC}"
echo "  Bot1: $BOT1_ID"
echo "  Bot2: $BOT2_ID"
echo ""

# Helper function for API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ -n "$data" ]; then
        curl -s -X "$method" "$API_BASE$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X "$method" "$API_BASE$endpoint"
    fi
}

# Step 1: Join bots to channel (if not already)
echo -e "${YELLOW}Step 1: Joining bots to channel...${NC}"

JOIN1=$(api_call POST "/channels/$CHANNEL_ID/join" "{\"botId\": \"$BOT1_ID\"}")
if echo "$JOIN1" | jq -e '.agentId' > /dev/null 2>&1; then
    echo -e "${GREEN}Bot1 joined/reconnected to channel${NC}"
elif echo "$JOIN1" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "${YELLOW}Bot1: $(echo "$JOIN1" | jq -r '.error')${NC}"
fi

JOIN2=$(api_call POST "/channels/$CHANNEL_ID/join" "{\"botId\": \"$BOT2_ID\"}")
if echo "$JOIN2" | jq -e '.agentId' > /dev/null 2>&1; then
    echo -e "${GREEN}Bot2 joined/reconnected to channel${NC}"
elif echo "$JOIN2" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "${YELLOW}Bot2: $(echo "$JOIN2" | jq -r '.error')${NC}"
fi
echo ""

# Step 2: Check for active game
echo -e "${YELLOW}Step 2: Checking for active game...${NC}"
ACTIVE_GAME=$(api_call GET "/channels/$CHANNEL_ID/games/active")
if [ "$ACTIVE_GAME" != "null" ] && [ -n "$ACTIVE_GAME" ]; then
    ACTIVE_GAME_ID=$(echo "$ACTIVE_GAME" | jq -r '.gameId // empty')
    if [ -n "$ACTIVE_GAME_ID" ]; then
        echo -e "${YELLOW}Found active game: $ACTIVE_GAME_ID. Cancelling...${NC}"
        api_call POST "/games/$ACTIVE_GAME_ID/cancel" "{\"botId\": \"$BOT1_ID\", \"reason\": \"test reset\"}" || true
        sleep 1
    fi
fi
echo ""

# Step 3: Create a new game
echo -e "${YELLOW}Step 3: Creating RPS game...${NC}"
CREATE_RESP=$(api_call POST "/games/create" "{
    \"channelId\": \"$CHANNEL_ID\",
    \"gameType\": \"rps\",
    \"botId\": \"$BOT1_ID\",
    \"config\": {\"rounds\": 3, \"timeoutSecs\": 60}
}")

GAME_ID=$(echo "$CREATE_RESP" | jq -r '.gameId')
if [ "$GAME_ID" == "null" ] || [ -z "$GAME_ID" ]; then
    echo -e "${RED}Failed to create game:${NC}"
    echo "$CREATE_RESP" | jq .
    exit 1
fi
echo -e "${GREEN}Created game: $GAME_ID${NC}"
echo ""

# Step 4: Bot2 joins the game
echo -e "${YELLOW}Step 4: Bot2 joining game...${NC}"
sleep 1
JOIN_RESP=$(api_call POST "/games/$GAME_ID/join" "{\"botId\": \"$BOT2_ID\"}")
echo "$JOIN_RESP" | jq .
sleep 1
echo ""

# Step 5: Check game state (sync)
echo -e "${YELLOW}Step 5: Syncing game state for Bot1...${NC}"
SYNC_RESP=$(api_call GET "/games/$GAME_ID/sync?botId=$BOT1_ID")
echo "$SYNC_RESP" | jq .
echo ""

# Step 6: Start the game
echo -e "${YELLOW}Step 6: Starting game...${NC}"
START_RESP=$(api_call POST "/games/$GAME_ID/start" "{\"botId\": \"$BOT1_ID\"}")
echo "$START_RESP" | jq .
TURN_ID=$(echo "$START_RESP" | jq -r '.turnId // 0')
sleep 1
echo ""

# Thinking time (seconds)
THINK_TIME="${THINK_TIME:-2}"

# Step 7: Play a round
echo -e "${YELLOW}Step 7: Playing round 1...${NC}"

# Bot1 thinks and chooses rock
echo "Bot1 is thinking..."
sleep $THINK_TIME
echo "Bot1 chooses: rock"
OP1_RESP=$(api_call POST "/games/$GAME_ID/operate" "{
    \"botId\": \"$BOT1_ID\",
    \"turnId\": $TURN_ID,
    \"action\": \"rock\",
    \"data\": {}
}")
echo "$OP1_RESP" | jq .
TURN_ID=$(echo "$OP1_RESP" | jq -r '.newTurnId // '$TURN_ID)

# Bot2 thinks and chooses scissors
echo "Bot2 is thinking..."
sleep $THINK_TIME
echo "Bot2 chooses: scissors"
OP2_RESP=$(api_call POST "/games/$GAME_ID/operate" "{
    \"botId\": \"$BOT2_ID\",
    \"turnId\": $TURN_ID,
    \"action\": \"scissors\",
    \"data\": {}
}")
echo "$OP2_RESP" | jq .
TURN_ID=$(echo "$OP2_RESP" | jq -r '.newTurnId // '$TURN_ID)
echo ""

# Step 8: Check result
echo -e "${YELLOW}Step 8: Checking game state after round 1...${NC}"
SYNC_RESP=$(api_call GET "/games/$GAME_ID/sync?botId=$BOT1_ID")
echo "$SYNC_RESP" | jq .

PHASE=$(echo "$SYNC_RESP" | jq -r '.currentPhase')
echo -e "${GREEN}Current phase: $PHASE${NC}"
echo ""

# Step 9: Continue if in reveal phase
if [ "$PHASE" == "reveal" ]; then
    echo "Showing results..."
    sleep $THINK_TIME

    echo -e "${YELLOW}Step 9: Advancing to next round...${NC}"
    NEXT_RESP=$(api_call POST "/games/$GAME_ID/operate" "{
        \"botId\": \"$BOT1_ID\",
        \"turnId\": $TURN_ID,
        \"action\": \"next_round\",
        \"data\": {}
    }")
    echo "$NEXT_RESP" | jq .
    TURN_ID=$(echo "$NEXT_RESP" | jq -r '.newTurnId // '$TURN_ID)
    sleep 1
    echo ""

    # Play round 2
    echo -e "${YELLOW}Playing round 2...${NC}"
    echo "Bot1 is thinking..."
    sleep $THINK_TIME
    echo "Bot1 chooses: paper"
    OP_RESP=$(api_call POST "/games/$GAME_ID/operate" "{\"botId\": \"$BOT1_ID\", \"turnId\": $TURN_ID, \"action\": \"paper\", \"data\": {}}")
    echo "$OP_RESP" | jq .
    TURN_ID=$(echo "$OP_RESP" | jq -r '.newTurnId // '$TURN_ID)

    echo "Bot2 is thinking..."
    sleep $THINK_TIME
    echo "Bot2 chooses: rock"
    OP_RESP=$(api_call POST "/games/$GAME_ID/operate" "{\"botId\": \"$BOT2_ID\", \"turnId\": $TURN_ID, \"action\": \"rock\", \"data\": {}}")
    echo "$OP_RESP" | jq .
    TURN_ID=$(echo "$OP_RESP" | jq -r '.newTurnId // '$TURN_ID)

    echo "Showing results..."
    sleep $THINK_TIME
fi

# Final state
echo ""
echo -e "${YELLOW}=== Final Game State ===${NC}"
api_call GET "/games/$GAME_ID/sync?botId=$BOT1_ID" | jq .

echo ""
echo -e "${GREEN}=== Test Complete ===${NC}"
echo "Game ID: $GAME_ID"
echo "You can view this game in the browser at: http://localhost:5173/#/channel/$CHANNEL_ID"
