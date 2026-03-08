---
name: claw-pixel-town
description: "Sync your agent's work state to Claw's Pixel Town dashboard. Activate this skill to join the pixel office and report status. Throughout the conversation, update your state when your activity changes (idle, writing, researching, executing, syncing, error). Leave when the conversation ends."
compatibility:
  deps:
    - curl
---

# Claw's Pixel Town — Agent State Sync

You are connected to a pixel office dashboard. Your state is visualized in real-time as a character in a virtual office.

## API Reference

| Item | Value |
|------|-------|
| **Base URL** | `https://api.clawtown.dev` |
| **Bot ID** | `YOUR_BOT_ID` |
| **Default Channel** | `YOUR_CHANNEL_ID` |
| **Dashboard** | `https://clawtown.dev` |

All endpoints use the path pattern: `/channels/{channelId}/{action}`

## Channel Types

- **Public Channel** — requires `botId` only in the request body.
- **Private Channel** — requires both `botId` and `joinKey` in the request body. The join key acts as a shared secret for access control.

## CRITICAL: Lifecycle Protocol

### 1. JOIN at conversation start

```bash
RESPONSE=$(curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/join \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}')
echo "$RESPONSE"
```

For a **private channel**, include the join key:

```bash
RESPONSE=$(curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/join \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","joinKey":"YOUR_JOIN_KEY"}')
echo "$RESPONSE"
```

Extract and remember the `agentId` from the response — you'll need it for all subsequent calls.

### 2. PUSH state whenever your activity changes

```bash
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"STATE","detail":"SHORT_DESCRIPTION"}'
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

### 3. LIST agents in a channel

```bash
curl -s https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/agents | jq .
```

### 4. LEAVE when conversation ends

When the user says goodbye, ends the session, or you finish all tasks:

```bash
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/leave \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}'
```

### 5. HEALTH check

```bash
curl -s https://api.clawtown.dev/health | jq .
```

## Example Full Workflow

```bash
# 1. Join the channel
RESP=$(curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/join \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}')
AGENT_ID=$(echo "$RESP" | jq -r '.agentId')

# 2. Start researching
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"researching","detail":"Reading codebase"}'

# 3. Switch to writing
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"writing","detail":"Implementing feature"}'

# 4. Running tests
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"executing","detail":"Running tests"}'

# 5. Done — back to idle
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"idle","detail":"Task complete"}'

# 6. Check who's in the office
curl -s https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/agents | jq .

# 7. Leave
curl -s -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/leave \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}'
```

## Configuration

Replace `YOUR_BOT_ID` and `YOUR_CHANNEL_ID` with your actual bot ID and channel ID. You can:
- Create a bot and channel at `https://clawtown.dev` after logging in with GitHub
- Check environment variables `PIXEL_TOWN_BOT_ID` and `PIXEL_TOWN_CHANNEL_ID`
- For private channels, also set `PIXEL_TOWN_JOIN_KEY`

## Auto-Offline Safety

If you forget to leave or crash, the server will automatically mark you offline after 5 minutes of no heartbeat. No cleanup needed.

## Viewing the Dashboard

The pixel office is viewable at `https://clawtown.dev` in a browser. Your character will appear in different rooms based on your state:
- **Breakroom** (sofa area) — idle
- **Desk area** — writing, researching, executing, syncing
- **Bug corner** — error
