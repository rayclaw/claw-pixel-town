# Claw's Pixel Town

[English](README.md)

一个实时像素风格办公室仪表盘，可视化展示 AI 编程代理在虚拟办公室环境中工作的状态。

![截图](static/Screenshot.jpg)

## 功能特点

- **实时代理可视化** - 观看 AI 代理根据当前状态在办公室中移动
- **多种代理状态** - 空闲、编写、研究、执行、同步、错误
- **多频道支持** - 为不同团队或项目创建公开/私密房间
- **GitHub OAuth** - 使用 GitHub 登录以创建和管理自己的房间
- **可定制布局** - 编辑模式设计自己的办公室布局
- **Bot 管理** - 创建可通过 API 加入频道的 Bot

## 架构

```
┌─────────────────┐           ┌─────────────────┐
│   clawtown.dev  │           │ api.clawtown.dev│
│  (Cloudflare)   │           │     (EC2)       │
│                 │           │                 │
│  - React UI     │  ──────>  │  - Rust API     │
│  - 静态文件      │           │  - WebSocket    │
│                 │           │  - SQLite 数据库 │
└─────────────────┘           └─────────────────┘
```

## 快速开始

### 前置要求

- Node.js 18+
- Rust 1.70+
- pnpm

### 开发

```bash
# 启动 API 服务器
cargo run

# 在另一个终端，启动前端开发服务器
cd webview-ui
pnpm install
pnpm dev
```

访问 http://localhost:5173

### 生产构建

```bash
# 为 Cloudflare Pages 构建前端
cd webview-ui
VITE_API_URL=https://api.clawtown.dev VITE_BASE_PATH=/ pnpm build

# 构建后端
cargo build --release
```

## API 端点

### 频道操作

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/channels/:id/join` | 使用 botId 加入频道 |
| POST | `/channels/:id/push` | 更新代理状态 |
| POST | `/channels/:id/leave` | 离开频道 |
| GET | `/channels/:id/agents` | 列出频道中的代理 |

### 示例：加入并推送状态

```bash
# 加入频道
curl -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/join \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}'

# 推送状态
curl -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/push \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID","state":"writing","detail":"实现功能"}'

# 离开频道
curl -X POST https://api.clawtown.dev/channels/YOUR_CHANNEL_ID/leave \
  -H 'Content-Type: application/json' \
  -d '{"botId":"YOUR_BOT_ID"}'
```

## 代理状态

| 状态 | 描述 |
|------|------|
| `idle` | 等待指令 |
| `writing` | 编写代码、编辑文件 |
| `researching` | 搜索、阅读文档 |
| `executing` | 运行命令、脚本 |
| `syncing` | Git 操作、文件同步 |
| `error` | 调试错误 |

## 集成

### Claude Code 技能

查看 [skills/claw-pixel-town/SKILL.md](skills/claw-pixel-town/SKILL.md) 了解如何与 Claude Code 或其他 AI 编程助手集成。

## 部署

详细部署说明请查看 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 致谢

本项目的灵感来源于以下项目：

- [pixel-agents](https://github.com/pablodelucca/pixel-agents) - 像素风格角色精灵和动画
- [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI) - 办公室布局和家具设计灵感

## 许可证

MIT

## 链接

- **仪表盘**: https://clawtown.dev
- **API**: https://api.clawtown.dev
