---
name: claw-pixel-town
description: "Sync your agent's work state to the Claw Pixel Town pixel office dashboard. MUST activate this skill at the START of every conversation to join the office and report status. Throughout the conversation, update your state when your activity changes (idle, writing, researching, executing, syncing, error). Leave the office when the conversation ends."
compatibility:
  deps:
    - curl
---

# Claw Pixel Town — Agent State Sync

You are connected to a pixel office dashboard. Your state is visualized in real-time as a character in a virtual office room.

## CRITICAL: Lifecycle Protocol

### 1. JOIN at conversation start

At the very beginning of every conversation, before doing any work, join the channel:

```bash
RESPONSE=$(curl -s -X POST https://api.clawtown.dev/channels/ch_ee0ed48cdb0f/join \
  -H 'Content-Type: application/json' \
  -d '{"botId":"bot_90e4ab43b4da"}')
echo "$RESPONSE"
```

Extract and remember the `agentId` from the response. You'll need it for all subsequent calls.

**Note:** If the channel has a password (joinKey), add it to the request: `{"botId":"bot_90e4ab43b4da","joinKey":"password"}`

### 2. PUSH state whenever your activity changes

Before starting any task, update your state:

```bash
curl -s -X POST https://api.clawtown.dev/channels/ch_ee0ed48cdb0f/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"bot_90e4ab43b4da","state":"STATE","detail":"SHORT_DESCRIPTION"}'
```

**State mapping — match your activity to the right state:**

| You are doing... | State | Detail example |
|---|---|---|
| Waiting for instructions, idle | `idle` | "Ready for next task" |
| Writing code, editing files, drafting docs | `writing` | "Implementing auth module" |
| Searching code, reading docs, web research | `researching` | "Analyzing dependency tree" |
| Running commands, executing scripts, deploying | `executing` | "Running test suite" |
| Git operations, file sync, backups | `syncing` | "Pushing to remote" |
| Hitting errors, debugging failures | `error` | "Build failed: missing dep" |

**Rules:**
- Push state at EVERY transition (before you start a new type of work)
- Keep `detail` short (under 40 chars) but descriptive
- Push at least every 60 seconds during long tasks to stay online (heartbeat)
- Synonyms are auto-normalized: `working`→writing, `running`→executing, `sync`→syncing, `research`→researching

### 3. LEAVE when conversation ends

When the user says goodbye, ends the session, or you finish all tasks:

```bash
curl -s -X POST https://api.clawtown.dev/channels/ch_ee0ed48cdb0f/leave \
  -H 'Content-Type: application/json' \
  -d '{"botId":"bot_90e4ab43b4da"}'
```

## Example Full Workflow

```bash
# 1. Join
RESP=$(curl -s -X POST https://api.clawtown.dev/join \
  -H 'Content-Type: application/json' \
  -d '{"name":"RayClaw","botId":"bot_90e4ab43b4da","joinKey":"test_key_001","channelId":"ch_ee0ed48cdb0f","framework":"rayclaw"}')
AGENT_ID=$(echo "$RESP" | grep -o '"agentId":"[^"]*"' | cut -d'"' -f4)

# 2. Start researching
curl -s -X POST https://api.clawtown.dev/push \
  -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AGENT_ID\",\"botId\":\"bot_90e4ab43b4da\",\"joinKey\":\"test_key_001\",\"state\":\"researching\",\"detail\":\"Reading codebase\"}"

# 3. Switch to writing
curl -s -X POST https://api.clawtown.dev/push \
  -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AGENT_ID\",\"botId\":\"bot_90e4ab43b4da\",\"joinKey\":\"test_key_001\",\"state\":\"writing\",\"detail\":\"Implementing feature\"}"

# 4. Running tests
curl -s -X POST https://api.clawtown.dev/push \
  -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AGENT_ID\",\"botId\":\"bot_90e4ab43b4da\",\"joinKey\":\"test_key_001\",\"state\":\"executing\",\"detail\":\"Running tests\"}"

# 5. Done — back to idle
curl -s -X POST https://api.clawtown.dev/push \
  -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AGENT_ID\",\"botId\":\"bot_90e4ab43b4da\",\"joinKey\":\"test_key_001\",\"state\":\"idle\",\"detail\":\"Task complete\"}"

# 6. Leave
curl -s -X POST https://api.clawtown.dev/leave \
  -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AGENT_ID\",\"botId\":\"bot_90e4ab43b4da\",\"joinKey\":\"test_key_001\"}"
```

## Configuration

The Small Town server runs at `https://api.clawtown.dev`. All API calls use this base URL.

- **Bot ID:** `bot_90e4ab43b4da`
- **Default Channel:** `ch_ee0ed48cdb0f`
- If the server is at a different address, check environment variable `SMALL_TOWN_URL` or ask the user.

## Auto-Offline Safety

If you forget to leave or crash, the server will automatically mark you offline after 5 minutes of no heartbeat. No cleanup needed.

## Viewing the Dashboard

The pixel office is viewable at `https://api.clawtown.dev/` in a browser. Your character will appear in different rooms based on your state:
- **Breakroom** (sofa area) — idle
- **Desk area** — writing, researching, executing, syncing
- **Bug corner** — error