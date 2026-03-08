#!/bin/bash
# Mock 5 agents for testing the star-office UI

API="http://localhost:3800"
DB="star-office.db"
JOIN_KEY="mock-test-key"

# Agent names
AGENTS=("Alice" "Bob" "Charlie" "Diana" "Eve")
FRAMEWORKS=("claude-code" "cursor" "aider" "cline" "windsurf")
STATES=("idle" "writing" "researching" "executing" "syncing")
DETAILS=(
  "Thinking..."
  "Writing code in src/main.rs"
  "Reading documentation"
  "Running cargo build"
  "Syncing changes to git"
)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Mock Agents Script ===${NC}"

# Step 1: Create join key in database
echo -e "${YELLOW}Creating join key...${NC}"
sqlite3 "$DB" "INSERT OR REPLACE INTO join_keys (key, max_concurrent, reusable) VALUES ('$JOIN_KEY', 10, 1);"
echo -e "${GREEN}Join key '$JOIN_KEY' created${NC}"

# Step 2: Register agents
declare -a AGENT_IDS
echo -e "${YELLOW}Registering agents...${NC}"

for i in "${!AGENTS[@]}"; do
  name="${AGENTS[$i]}"
  framework="${FRAMEWORKS[$i]}"

  response=$(curl -s -X POST "$API/join" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$name\", \"joinKey\": \"$JOIN_KEY\", \"framework\": \"$framework\"}")

  agent_id=$(echo "$response" | grep -o '"agentId":"[^"]*"' | cut -d'"' -f4)

  if [ -n "$agent_id" ]; then
    AGENT_IDS+=("$agent_id")
    echo -e "${GREEN}  Registered: $name ($framework) -> $agent_id${NC}"
  else
    echo -e "  Failed to register $name: $response"
  fi
done

echo ""
echo -e "${BLUE}Agents registered: ${#AGENT_IDS[@]}${NC}"
echo ""

# Step 3: Simulate activity loop
echo -e "${YELLOW}Starting activity simulation (Ctrl+C to stop)...${NC}"
echo ""

cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up - removing agents...${NC}"
  for agent_id in "${AGENT_IDS[@]}"; do
    curl -s -X POST "$API/leave" \
      -H "Content-Type: application/json" \
      -d "{\"agentId\": \"$agent_id\", \"joinKey\": \"$JOIN_KEY\"}" > /dev/null
  done
  echo -e "${GREEN}Done!${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

while true; do
  for i in "${!AGENT_IDS[@]}"; do
    agent_id="${AGENT_IDS[$i]}"
    name="${AGENTS[$i]}"

    # Random state
    state_idx=$((RANDOM % ${#STATES[@]}))
    state="${STATES[$state_idx]}"
    detail="${DETAILS[$state_idx]}"

    curl -s -X POST "$API/push" \
      -H "Content-Type: application/json" \
      -d "{\"agentId\": \"$agent_id\", \"joinKey\": \"$JOIN_KEY\", \"state\": \"$state\", \"detail\": \"$detail\"}" > /dev/null

    echo -e "  ${name}: ${state} - ${detail}"
  done

  echo ""
  sleep 3
done
