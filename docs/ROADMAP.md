# Small Town — Pixel Office Platform Roadmap

> Multi-channel agent office with minimal resource footprint.
> Last updated: 2026-03-08

---

## Vision

Small Town 是一个轻量级像素风 Agent 办公可视化平台。  
每个 **Channel（房间）** 是一个独立的像素办公室，有自己的布局、家具和成员。  
多个 Channel 共存于一个 **Lobby（大厅）** 中，用户从大厅选择房间进入。  
房间 Owner 通过 Join Key 控制准入，所有这一切跑在单个 Rust 进程 + 一个 SQLite 文件上。

---

## Architecture Principles

| 原则 | 具体做法 |
|------|----------|
| **单进程** | 一个 `star-office` binary 服务所有 Channel，不拆微服务 |
| **单 DB** | 一个 SQLite 文件（WAL 模式），Channel 数据按 `channel_id` 分区 |
| **零 JS 依赖** | 前端 Canvas 2D 纯手绘像素精灵，不依赖 Phaser/PixiJS |
| **SSE 替代轮询** | 用 Server-Sent Events 推送状态变更，省掉 2s 一次的 polling |
| **静态资产 CDN 化** | Layout JSON + 家具 sprites 可选走 CDN，服务器只做 API |
| **按需加载** | 只有进入 Channel 才拉该房间的 layout 和 agent 列表 |

---

## Data Model Evolution

### Current (v1) — Single Room
```
join_keys ── agents ── main_state
```

### Target (v2) — Multi-Channel
```
users
  └─ user_id (PK)
  └─ name, avatar, created_at

bots
  └─ bot_id (PK, 平台唯一 nanoid)
  └─ name ("CodeGen", "Reviewer", ...)
  └─ owner_user_id (FK → users)
  └─ avatar
  └─ current_channel_id (FK nullable — 当前所在房间)
  └─ current_agent_id (当前在线 agent_id)
  └─ online (BOOL)
  └─ created_at

channels
  └─ channel_id (PK, nanoid)
  └─ name
  └─ owner_user_id (FK → users)
  └─ type (public | private)
  └─ join_key (每个 channel 一个 key)
  └─ whitelist (JSON array — 仅 private 生效，存 botId 列表)
  └─ max_members
  └─ layout (JSON blob — OfficeLayout)
  └─ is_public (BOOL, 大厅是否可见)
  └─ created_at

channel_members
  └─ channel_id + bot_id (composite PK)
  └─ agent_id (当前在线 agent 的 ID)
  └─ state, detail, area
  └─ online (BOOL)
  └─ last_push_at
  └─ joined_at

join_keys (保留，兼容 v1 Bot 接入)
  └─ key (PK)
  └─ channel_id (FK, nullable — null = 平台级 key)
  └─ max_concurrent (该 key 下最多同时在线 bot 数)
  └─ reusable, expires_at
```

**Channel 类型:**
- **Public**: 只需 `joinKey` 即可加入，大厅可见
- **Private**: 需要 `joinKey` + `botId` 在 whitelist 中

**Bot 约束: 一个 bot 同一时间只能在一个房间。** 切换房间需先 leave 再 join。

### Migration Strategy
- v1 的 `agents` 表数据迁移到 `channel_members` + 一个默认 Public Channel
- v1 的 Join Key API 保持兼容：无 `botId` 参数时走老逻辑（仅 joinKey 认证，默认 Channel）
- `main_state` 表废弃，Star agent 变为默认 Channel 的 owner
- 已有的 `join_key` 数据保留，绑定到默认 Channel
- 新的 Bot 需要先注册获得 `botId`，再用 `botId` + `joinKey` 加入 Channel

---

## Phase 0 — Foundation Hardening 🔧
> 目标: 修掉现有架构债务，为多 Channel 打基础  
> 预计: 1-2 天

### 0.1 Async Safety
- [x] `db.rs`: `std::sync::Mutex` + `spawn_blocking` 包装 rusqlite（使用 Arc<Mutex> 支持 Clone）
- [x] 消除全部 `lock().unwrap()`，改为 `?` 传播（自定义 DbError 类型）
- [ ] 考虑用 connection pool（`r2d2` + `rusqlite`）替代单连接 Mutex（暂不需要）

### 0.2 Security Baseline
- [x] `/set_state`, `/broadcast` 加 admin token 认证（`Authorization: Bearer <token>`）
- [x] `/agents/{id}` 返回 `AgentPublicView`（不泄漏 `join_key`）
- [x] 输入验证: `name` ≤ 32 char, `detail` ≤ 256 char, strip HTML
- [x] Rate limiting: `tower-governor` 中间件, 默认 60 req/min per IP

### 0.3 Code Cleanup
- [x] 删除旧 Phaser 前端残留（已清理，无残留）
- [x] 清理多版本 JS bundle（删除 `index-BrEPM-ax.js`）
- [x] `.gitignore` 已包含 `node_modules/`, `target/`, `*.db-wal`, `*.db-shm`

### 0.4 DB Migration Framework
- [x] 引入版本化迁移: `migrations/001_init.sql`
- [x] 启动时自动检查并执行 pending migrations
- [x] `schema_version` 表记录当前版本

---

## Phase 1 — Multi-Channel Core 🏢
> 目标: 支持创建/加入多个房间，每个房间独立布局和成员  
> 预计: 3-5 天

### 1.1 Channel CRUD
```
POST   /channels              — 创建 Channel（需 user token）
GET    /channels               — 列出公开 Channel（大厅列表）
GET    /channels/{id}          — Channel 详情（含 layout）
PATCH  /channels/{id}          — 修改名称/设置（仅 owner）
DELETE /channels/{id}          — 删除 Channel（仅 owner）
```

**Channel 创建参数:**
```json
{
  "name": "Star's Workshop",
  "joinKey": "optional-password",   // null = 公开房间
  "maxMembers": 20,
  "isPublic": true                  // 是否在大厅列表可见
}
```

### 1.2 Channel Join/Leave
```
POST /channels/{id}/join      — 加入 Channel（需 joinKey if 设了密码）
POST /channels/{id}/leave     — 离开 Channel
POST /channels/{id}/push      — 心跳 + 状态更新
GET  /channels/{id}/agents    — 该 Channel 的在线 agent 列表
```

**兼容 v1:** 保留 `/join`, `/push`, `/leave` 端点，内部路由到默认 Channel。

### 1.3 Bot 注册与 Channel 加入
> 解决: 同一 Join Key 被反复 /join 刷出幽灵 agent 的问题

**Bot 管理 API (平台级):**
```
POST   /bots                   — 注册 Bot（返回 botId）
GET    /bots                   — 列出我的 Bot
DELETE /bots/{botId}           — 注销 Bot
```

**注册参数:**
```json
{
  "name": "CodeGen"
}
```
**返回:**
```json
{
  "botId": "bot_abc123"         // 平台唯一 ID，用于加入任意 Channel
}
```

**Channel Whitelist 管理 (仅 Private Channel, Owner 操作):**
```
PUT    /channels/{id}/whitelist       — 设置白名单
GET    /channels/{id}/whitelist       — 获取白名单
POST   /channels/{id}/whitelist/add   — 添加 botId 到白名单
DELETE /channels/{id}/whitelist/{botId} — 从白名单移除 botId
```

**Whitelist 存储:**
```json
{
  "whitelist": ["bot_abc123", "bot_def456", "bot_ghi789"]
}
```

**Join 流程 (简化):**
```json
POST /channels/{id}/join
{
  "botId": "bot_abc123",         // 谁
  "joinKey": "channel_key_001"   // 房间钥匙
}
```

**服务端逻辑:**
```
1. 验证 joinKey 有效 + 未过期
2. 验证 botId 存在
3. 检查 channel.type:
   → public  → 直接通过
   → private → 检查 botId 是否在 channel.whitelist 中
4. 检查 bot.current_channel_id:
   → 非空且 != 目标房间 → 403 "Bot already in another channel, leave first"
   → 非空且 == 目标房间 → 返回已有 agent_id（断线重连）
   → 空 → 创建新 agent，写入 bot.current_channel_id + current_agent_id
5. max_members 检查（该 channel 在线 bot 数）
```

**约束:**
- 🔒 **一个 bot 同时只能在一个房间** — 切换房间需先 `/leave`
- 🔄 **断线重连复用 agent_id** — 不再每次生成新 ID，头像/座位保持不变
- 🗑️ **Leave 时清空** `bot.current_channel_id` + `current_agent_id`
- ⏰ **Auto-offline 同步** — 后台任务标记 bot offline 时同步清空 current_channel_id

**向下兼容:** 请求中没有 `botId` 字段时走 v1 老逻辑（仅 joinKey 认证，默认 Channel）。

### 1.4 Channel Layout 持久化
- [ ] `POST /channels/{id}/layout` — 保存房间布局（Owner only）
- [ ] `GET /channels/{id}/layout` — 获取房间布局
- [ ] Layout 存为 JSON blob in SQLite（单字段，避免关系化家具表的复杂度）
- [ ] Layout 版本号，支持 undo/rollback（保留最近 5 个版本）

### 1.5 User Identity (Lightweight)
> 不做完整注册系统，保持轻量

**方案 A — Token-based (推荐):**
- 首次访问分配 `user_token`（nanoid），存浏览器 localStorage
- 用户自定义昵称/头像，绑定到 token
- Channel owner 就是创建者的 token
- 无密码、无邮箱、无 OAuth

**方案 B — Bot 注册 (AI Agent 接入):**
- 用户注册 Bot，获得平台唯一 `botId`
- Bot 使用 `botId` + Channel 的 `joinKey` 加入房间
- Private Channel 需要 owner 将 `botId` 加入白名单
- 适合 OpenClaw/NullClaw/NanoBot 等 AI Agent 接入

两套认证并存：浏览器用户走 Token，Bot 走 botId + joinKey。

### 1.6 SSE Real-time Push
```
GET /channels/{id}/events     — SSE stream
```
**事件类型:**
```
event: agent_join
event: agent_leave  
event: agent_state
event: layout_update
event: channel_update
```

实现:
- [ ] `tokio::sync::broadcast` channel per room（懒创建，无人时 drop）
- [ ] 前端 `EventSource` 替代 `setInterval` polling
- [ ] SSE 自动重连（浏览器原生支持）
- [ ] 心跳: 每 30s 发 `:keepalive\n\n` 防超时

---

## Phase 2 — Lobby & Navigation 🚪
> 目标: 大厅作为入口，浏览和进入各个房间  
> 预计: 2-3 天

### 2.1 Lobby View (前端)
- [ ] 新页面/视图: Channel 卡片列表
  - 房间名、在线人数、缩略图（Canvas 截图 or 布局预览）
  - 🔒 图标表示需要密码
  - 「创建房间」按钮
- [ ] URL 路由: `/` = 大厅, `/channel/{id}` = 房间
- [ ] 进入房间时如果有 joinKey，弹出密码输入框

### 2.2 Lobby API
```
GET /lobby                    — 聚合数据: 公开 channels + 在线统计
GET /lobby/stats              — 平台统计: 总房间数、总在线、最活跃房间
```

### 2.3 Channel 缩略图
- [ ] 前端生成: 进入房间后 Canvas 截一帧小图，base64 上传
- [ ] `PUT /channels/{id}/thumbnail`
- [ ] 大厅卡片显示最近截图 or 默认占位图
- [ ] 缩略图缓存 + 定时刷新（每 5 分钟）

### 2.4 房间发现
- [ ] 大厅按「在线人数」排序
- [ ] 支持搜索房间名
- [ ] 「最近访问」列表（localStorage）
- [ ] 「我的房间」tab（我创建或加入的）

---

## Phase 3 — Room Map Editor 🗺️
> 目标: 可视化编辑房间地图（地砖、墙壁、房间大小）  
> 预计: 3-4 天  
> 注: 当前已有 furniture editor 和 tile paint，此阶段扩展为完整的 map editor

### 3.1 地图编辑器增强
- [ ] **房间模板**: 预设 3-5 种布局模板（小型 10x8、标准 20x11、大型 30x15、L 型、多房间）
- [ ] **房间大小调整**: 拖拽边框扩展/缩小网格（当前支持但 UI 不明显）
- [ ] **多楼层/分区**: 同一 Channel 内可定义多个「区域」（工作区、休息区、会议室）
  - 区域间用门/过道连接
  - Agent 可在区域间移动
- [ ] **撤销/重做**: 当前已有 undo stack (50步)，确保 map resize 也支持

### 3.2 地砖系统
- [ ] 当前有 7 种 floor tile pattern + wall + void
- [ ] 增加: 户外地砖（草地、石路）、特殊地砖（传送门入口）
- [ ] Tile colorize 系统已有（HSB + contrast），保持

### 3.3 墙壁系统
- [ ] 当前: 简单墙壁（walls.png 素材）
- [ ] 增加: 窗户墙、门墙、半高墙
- [ ] 自动墙壁连接（autotile）: 根据相邻 tile 自动选择墙壁 sprite

---

## Phase 4 — Furniture/Item Editor 🪑
> 目标: 用户可自定义家具/物品  
> 预计: 3-4 天

### 4.1 自定义精灵编辑器
- [ ] 16x16 / 32x32 / 48x48 像素画编辑器（内置在前端）
  - 画笔、橡皮擦、填充、取色器
  - 调色板（预设 + 自定义）
  - 导入/导出 PNG
- [ ] 编辑好的精灵保存为 `SpriteData`（hex color 2D array）
- [ ] 精灵预览: 放置在 office 中实时查看效果

### 4.2 家具属性编辑
- [ ] 编辑已有家具的属性:
  - `footprintW/H`: 占地大小
  - `isDesk`: 是否为桌子（影响椅子朝向检测）
  - `canPlaceOnSurfaces`: 可放在桌面上
  - `backgroundTiles`: 背景行数（角色可走过）
  - `canPlaceOnWalls`: 可挂墙上
- [ ] 旋转组定义: 一件家具的 front/back/left/right 变体

### 4.3 社区家具库
- [ ] 用户创建的家具可「发布」到公共库
- [ ] 其他 Channel 的 owner 可从库中导入
- [ ] 家具 JSON 格式标准化，方便分享

### 4.4 动态资产加载 (已有基础)
- 当前 `assetLoader.ts` 支持从 `/static/assets/furniture/` 加载 PNG → SpriteData
- [ ] 扩展: 从 Channel 自定义家具存储中加载
- [ ] 资产缓存: Service Worker or IndexedDB

---

## Phase 5 — Polish & Scale 💎
> 预计: 持续

### 5.1 性能优化
- [ ] Canvas 离屏渲染: 家具层不变时用 OffscreenCanvas 缓存
- [ ] 大房间优化: 只渲染视口内的 tile（当前全量渲染，64x64 时可能卡）
- [ ] Agent 数量优化: 超过 50 个 agent 时隐藏远处的，只显示附近的
- [ ] SQLite 优化: 启用 `PRAGMA synchronous = NORMAL`，WAL checkpoint 策略

### 5.2 安全增强
- [ ] Join Key 支持 bcrypt 哈希存储（当前明文）
- [ ] Private Channel whitelist 验证
- [ ] Channel owner 可踢人、封禁
- [ ] API 全局 rate limit + per-channel rate limit
- [ ] Content-Security-Policy header
- [ ] PII audit: agent name/detail 的存储和展示安全

### 5.3 可观测性
- [ ] Prometheus metrics endpoint (`/metrics`)
  - 在线 agent 数、请求 QPS、SSE 连接数、DB 查询延迟
- [ ] Structured logging (JSON format, tracing-subscriber)
- [ ] Health check 增强: DB 连通性、内存使用

### 5.4 部署
- [ ] 单 binary 打包（`cargo build --release`，当前已支持）
- [ ] Dockerfile: multi-stage build, 最终镜像 < 20MB
- [ ] `config.toml` 支持环境变量覆盖（`STAR_OFFICE_PORT` etc.）
- [ ] systemd service 文件
- [ ] 自动备份 SQLite DB（cron + cp）

---

## API Design (v2 Complete)

### Authentication
```
所有写操作需要 Authorization header:
  - 浏览器用户: Authorization: Bearer <user_token>
  - Bot/Agent:   在 body 中带 joinKey（兼容 v1）
读操作（GET）默认公开，private channel 需要认证
```

### Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | 健康检查 |
| GET | `/lobby` | — | 大厅: 公开房间列表 |
| GET | `/lobby/stats` | — | 平台统计 |
| POST | `/channels` | user | 创建 Channel |
| GET | `/channels` | — | 列出公开 Channel |
| GET | `/channels/{id}` | — | Channel 详情 |
| PATCH | `/channels/{id}` | owner | 修改 Channel |
| DELETE | `/channels/{id}` | owner | 删除 Channel |
| POST | `/channels/{id}/join` | user/bot | 加入 Channel |
| POST | `/channels/{id}/leave` | user/bot | 离开 Channel |
| POST | `/channels/{id}/push` | user/bot | 心跳 + 状态更新 |
| GET | `/channels/{id}/agents` | — | 在线 agent 列表 |
| GET | `/channels/{id}/events` | — | SSE 实时流 |
| GET | `/channels/{id}/layout` | — | 获取房间布局 |
| POST | `/channels/{id}/layout` | owner | 保存房间布局 |
| PUT | `/channels/{id}/thumbnail` | owner | 上传缩略图 |
| POST | `/bots` | user | 注册 Bot（返回 botId）|
| GET | `/bots` | user | 列出我的 Bot |
| DELETE | `/bots/{botId}` | user | 注销 Bot |
| PUT | `/channels/{id}/whitelist` | owner | 设置白名单（仅 private）|
| GET | `/channels/{id}/whitelist` | owner | 获取白名单 |
| POST | `/channels/{id}/whitelist/add` | owner | 添加 botId 到白名单 |
| DELETE | `/channels/{id}/whitelist/{botId}` | owner | 移除 botId |
| — | — | — | — |
| POST | `/join` | bot/key | v1 兼容: 加入默认 Channel |
| POST | `/push` | bot/key | v1 兼容: 推送到默认 Channel |
| POST | `/leave` | bot/key | v1 兼容: 离开默认 Channel |
| GET | `/agents` | — | v1 兼容: 默认 Channel agents |

---

## Resource Budget

| 指标 | 目标 |
|------|------|
| 服务端内存 | < 50MB（100 个 Channel, 500 个 Agent） |
| SQLite 文件 | < 10MB（无 blob，layout JSON 压缩） |
| 前端 JS bundle | < 250KB gzip |
| 前端静态资产 | < 2MB（字体 + 默认精灵） |
| SSE 连接 | 每 Channel 一个 broadcast，O(1) per publish |
| API 延迟 | < 10ms P99（本地 SQLite） |

---

## Non-Goals (Explicitly Out of Scope)

- ❌ 用户注册/登录系统（OAuth, 邮箱验证）
- ❌ 实时聊天 / 消息系统
- ❌ 语音/视频通话
- ❌ 3D 渲染
- ❌ 多服务器分布式部署（保持单进程）
- ❌ 移动端 App（Web only，但响应式适配）

---

## Timeline Summary

```
Phase 0  ████░░░░░░░░░░░░  1-2 days   Foundation Hardening
Phase 1  ░░░░████████░░░░  3-5 days   Multi-Channel Core
Phase 2  ░░░░░░░░░░████░░  2-3 days   Lobby & Navigation
Phase 3  ░░░░░░░░░░░░████  3-4 days   Room Map Editor
Phase 4  ░░░░░░░░░░░░░░██  3-4 days   Furniture/Item Editor
Phase 5  ░░░░░░░░░░░░░░░░  Ongoing    Polish & Scale
         ─────────────────
         ~2-3 weeks to Phase 2 (可用 MVP)
         ~4-5 weeks to Phase 4 (完整编辑器)
```

---

## Open Questions

1. **Channel 数量上限?** — 建议初期限制 100 个，按需放开
2. **布局是否允许协同编辑?** — 建议 Phase 1 只允许 owner 编辑，后续考虑多人协同
3. **家具精灵分辨率?** — 当前 16px tile 体系下够用，是否需要 @2x 高清版本
4. **是否需要房间内小地图?** — 大房间（30x15+）可能需要 minimap 导航
5. **Bot Agent 是否可以创建 Channel?** — 建议不允许，只允许加入
6. **Private Channel 白名单上限?** — 建议 100 个 botId，防止滥用
