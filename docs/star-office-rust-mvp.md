# Star Office Rust Rewrite — MVP Plan

## 目标

用 Rust 重写 Star Office 后端，实现：
- **多用户**：多个 RayClaw 实例通过 join-key 接入同一个 Office
- **多框架**：兼容 RayClaw / OpenClaw / ZeroClaw / NullClaw / NanoBot 的 agent-push
- **Agent 隐私隔离**：每个 Agent 只能看到自己的状态细节，公共视图只暴露 name + state + area

MVP 先跑通 RayClaw，其他框架只需实现 `POST /agent-push` 即可接入。

---

## 架构

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  RayClaw-A  │  │  OpenClaw-B │  │  NullClaw-C │
│  (Skill)    │  │  (插件)     │  │  (native)   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │ POST /agent-push (agentId + joinKey + state)
       ▼                ▼                ▼
┌─────────────────────────────────────────────────┐
│              star-office (Rust / axum)           │
│                                                  │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Auth      │  │ State    │  │ Presence     │ │
│  │ (JoinKey) │  │ Machine  │  │ (auto-idle/  │ │
│  │           │  │ (6 states)│  │  auto-offline)│ │
│  └───────────┘  └──────────┘  └──────────────┘ │
│                                                  │
│  Storage: SQLite (单文件, 零运维)                │
└──────────────────┬──────────────────────────────┘
                   │ GET /agents (公共视图)
                   ▼
            前端 / Pixel Office / 任意消费者
```

---

## Crate 结构（最小化）

```
star-office/
├── Cargo.toml           # workspace
├── crates/
│   ├── star-office-core/    # 类型 + 状态机 + 存储 trait
│   └── star-office-server/  # axum HTTP 服务 (bin)
├── migrations/              # SQLite schema
└── config.example.toml
```

两个 crate 足矣。后续按需拆 `star-office-db`、`star-office-auth` 等。

---

## 数据模型

### Agent

```rust
pub enum AgentState {
    Idle, Writing, Researching, Executing, Syncing, Error,
}

pub struct Agent {
    pub id: String,           // uuid 或 agent 自报
    pub name: String,
    pub state: AgentState,
    pub detail: String,       // 仅 owner 可见
    pub area: Area,           // 由 state 派生: breakroom / writing / error
    pub framework: String,    // "rayclaw" | "openclaw" | "zeroclaw" | ...
    pub join_key: String,     // 关联的 key (不对外暴露)
    pub last_push_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}
```

### JoinKey

```rust
pub struct JoinKey {
    pub key: String,
    pub max_concurrent: u32,  // 默认 3
    pub reusable: bool,
    pub expires_at: Option<DateTime<Utc>>,
}
```

### 公共视图（隐私隔离）

```rust
// GET /agents 返回这个，detail 被过滤掉
pub struct AgentPublicView {
    pub id: String,
    pub name: String,
    pub state: AgentState,
    pub area: Area,
    pub framework: String,
    pub online: bool,
}
```

---

## API（6 个端点，够用）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `POST` | `/join` | joinKey | Agent 注册接入 → 返回 agentId |
| `POST` | `/push` | agentId + joinKey | Agent 推送状态（= 心跳） |
| `POST` | `/leave` | agentId + joinKey | Agent 主动下线 |
| `GET`  | `/agents` | 无 | 公共视图：所有在线 Agent（隐私过滤后） |
| `GET`  | `/agents/{id}` | agentId + joinKey | 自己的完整视图（含 detail） |
| `GET`  | `/health` | 无 | 服务健康检查 |

### 状态归一化

沿用 Star Office 的 synonym mapping，宽进严出：

```
working / busy / write → Writing
run / running / execute / exec → Executing
sync → Syncing
research / search → Researching
unknown / 乱填 → Idle
```

---

## 核心逻辑

### 1. Auto-idle（自动空闲）

后台 tokio task，每 30s 扫描一次：
- Agent 在 `Working` 状态超过 `ttl`（默认 300s）→ 自动设为 `Idle`
- 比 Star Office 的 read-time 检查更可靠，无竞态

### 2. Auto-offline（自动离线）

同一个后台 task：
- Agent `last_push_at` 超过 `offline_ttl`（默认 300s）→ 标记 `online = false`
- 前端 `/agents` 可选择过滤 offline agents

### 3. JoinKey 并发控制

```rust
// 用 tokio::sync::Mutex 保护 join 操作
let _guard = self.join_lock.lock().await;
// 在锁内重新查询 key 的当前使用数，防止 TOCTOU
let current = db.count_agents_by_key(&key).await?;
if current >= key.max_concurrent {
    return Err(AppError::KeyAtCapacity);
}
```

### 4. 多框架兼容

不做框架特殊适配。任何能发 HTTP POST JSON 的都能接入：

```bash
# 任何框架的接入方式完全一样
curl -X POST https://office.example.com/push \
  -H "Content-Type: application/json" \
  -d '{"agentId":"abc","joinKey":"ocj_xxx","state":"writing","detail":"drafting report"}'
```

---

## 技术栈

| 依赖 | 用途 |
|------|------|
| `axum` | HTTP 服务 |
| `tokio` | 异步运行时 |
| `rusqlite` (bundled) | SQLite 存储 |
| `serde` / `serde_json` | 序列化 |
| `chrono` | 时间处理 |
| `tracing` | 日志 |
| `tower-http` (cors) | CORS 中间件 |

不引入 ORM。SQL 直写，MVP 阶段表就 2 张（agents + join_keys）。

---

## SQLite Schema

```sql
CREATE TABLE join_keys (
    key         TEXT PRIMARY KEY,
    max_concurrent INTEGER NOT NULL DEFAULT 3,
    reusable    BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at  TEXT,  -- ISO 8601, nullable
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'idle',
    detail      TEXT NOT NULL DEFAULT '',
    framework   TEXT NOT NULL DEFAULT 'unknown',
    join_key    TEXT NOT NULL REFERENCES join_keys(key),
    online      BOOLEAN NOT NULL DEFAULT TRUE,
    last_push_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agents_join_key ON agents(join_key);
CREATE INDEX idx_agents_online ON agents(online);
```

---

## 配置

```toml
# config.toml
[server]
host = "0.0.0.0"
port = 3800

[presence]
auto_idle_ttl_secs = 300     # 工作状态超时 → idle
auto_offline_ttl_secs = 300  # 无心跳超时 → offline
scan_interval_secs = 30      # 后台扫描频率

[storage]
db_path = "star-office.db"
```

---

## 实施路线

| 阶段 | 内容 | 时间 |
|------|------|------|
| **Day 1** | Cargo workspace + core 类型 + SQLite schema + migrations | 2h |
| **Day 2** | axum server: `/join` + `/push` + `/leave` + `/agents` | 3h |
| **Day 3** | 后台 auto-idle/offline task + JoinKey 并发控制 | 2h |
| **Day 4** | 状态归一化 + `/agents/{id}` 隐私视图 + CORS + 配置加载 | 2h |
| **Day 5** | RayClaw Skill 客户端（`claw-state-sync`）+ 集成测试 | 2h |
| **Buffer** | Docker 打包 + README + config.example.toml | 1h |

**总计 ≈ 5 天，~12h 编码时间。**

---

## MVP 之后（不急）

- [ ] WebSocket 实时推送（替代前端轮询）
- [ ] Pixel Office 前端对接（`claw-pixel-office`）
- [ ] Agent 审批流（pending → approved，目前 MVP 直接 auto-approve）
- [ ] API Key 加密存储（chacha20poly1305）
- [ ] Rate limiting（tower middleware）
- [ ] Prometheus metrics
- [ ] 多 Office 实例（namespace 隔离）

