# Claw's Pixel Town

A real-time pixel office dashboard that visualizes AI coding agents working in a virtual office environment.

一个实时像素风格办公室仪表盘，可视化展示 AI 编程代理在虚拟办公室环境中工作的状态。

![Screenshot](static/Screenshot.jpg)

## Features | 功能特点

- **Real-time Agent Visualization** - Watch AI agents move around the office based on their current state
- **Multiple Agent States** - idle, writing, researching, executing, syncing, error
- **Multi-channel Support** - Create public/private rooms for different teams or projects
- **GitHub OAuth** - Login with GitHub to create and manage your own rooms
- **Customizable Layout** - Edit mode to design your own office layout
- **Bot Management** - Create bots that can join your channels via API

---

- **实时代理可视化** - 观看 AI 代理根据当前状态在办公室中移动
- **多种代理状态** - 空闲、编写、研究、执行、同步、错误
- **多频道支持** - 为不同团队或项目创建公开/私密房间
- **GitHub OAuth** - 使用 GitHub 登录以创建和管理自己的房间
- **可定制布局** - 编辑模式设计自己的办公室布局
- **Bot 管理** - 创建可通过 API 加入频道的 Bot

## Architecture | 架构

```
┌─────────────────┐           ┌─────────────────┐
│   clawtown.dev  │           │ api.clawtown.dev│
│  (Cloudflare)   │           │     (EC2)       │
│                 │           │                 │
│  - React UI     │  ──────>  │  - Rust API     │
│  - Static files │           │  - WebSocket    │
│                 │           │  - SQLite DB    │
└─────────────────┘           └─────────────────┘
```

## Quick Start | 快速开始

### Prerequisites | 前置要求

- Node.js 18+
- Rust 1.70+
- pnpm

### Development | 开发

```bash
# Start the API server
# 启动 API 服务器
cargo run

# In another terminal, start the frontend dev server
# 在另一个终端，启动前端开发服务器
cd webview-ui
pnpm install
pnpm dev
```

Visit http://localhost:5173

### Production Build | 生产构建

```bash
# Build frontend for Cloudflare Pages
# 为 Cloudflare Pages 构建前端
cd webview-ui
VITE_API_URL=https://api.clawtown.dev VITE_BASE_PATH=/ pnpm build

# Build backend
# 构建后端
cargo build --release
```

## API Endpoints | API 端点

### Channel Operations | 频道操作

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/channels/:id/join` | Join a channel with botId |
| POST | `/channels/:id/push` | Update agent state |
| POST | `/channels/:id/leave` | Leave a channel |
| GET | `/channels/:id/agents` | List agents in channel |

### Example: Join and Push State | 示例：加入并推送状态

```bash
# Join channel | 加入频道
curl -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/join \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}'

# Push state | 推送状态
curl -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"writing","detail":"Implementing feature"}'

# Leave channel | 离开频道
curl -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/leave \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}'
```

## Agent States | 代理状态

| State | Description | 描述 |
|-------|-------------|------|
| `idle` | Waiting for instructions | 等待指令 |
| `writing` | Writing code, editing files | 编写代码、编辑文件 |
| `researching` | Searching, reading docs | 搜索、阅读文档 |
| `executing` | Running commands, scripts | 运行命令、脚本 |
| `syncing` | Git operations, file sync | Git 操作、文件同步 |
| `error` | Debugging failures | 调试错误 |

## Integration | 集成

### Claude Code Skill

See [skills/claws-pixel-town/SKILL.md](skills/claws-pixel-town/SKILL.md) for integrating with Claude Code or other AI coding assistants.

查看 [skills/claws-pixel-town/SKILL.md](skills/claws-pixel-town/SKILL.md) 了解如何与 Claude Code 或其他 AI 编程助手集成。

## Deployment | 部署

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

详细部署说明请查看 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## License | 许可证

MIT

## Links | 链接

- **Dashboard | 仪表盘**: https://clawtown.dev
- **API**: https://api.clawtown.dev
