use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentState {
    Idle,
    Writing,
    Researching,
    Executing,
    Syncing,
    Error,
}

impl AgentState {
    pub fn area(&self) -> Area {
        match self {
            AgentState::Idle => Area::Breakroom,
            AgentState::Writing | AgentState::Researching | AgentState::Executing | AgentState::Syncing => Area::Writing,
            AgentState::Error => Area::Error,
        }
    }
}

impl std::fmt::Display for AgentState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            AgentState::Idle => "idle",
            AgentState::Writing => "writing",
            AgentState::Researching => "researching",
            AgentState::Executing => "executing",
            AgentState::Syncing => "syncing",
            AgentState::Error => "error",
        };
        f.write_str(s)
    }
}

impl AgentState {
    pub fn from_str_normalized(s: &str) -> Self {
        match s.to_lowercase().trim() {
            "writing" | "working" | "busy" | "write" => AgentState::Writing,
            "executing" | "run" | "running" | "execute" | "exec" => AgentState::Executing,
            "syncing" | "sync" => AgentState::Syncing,
            "researching" | "research" | "search" => AgentState::Researching,
            "error" | "err" | "fail" | "failed" => AgentState::Error,
            _ => AgentState::Idle,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Area {
    Breakroom,
    Writing,
    Error,
}

impl std::fmt::Display for Area {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Area::Breakroom => "breakroom",
            Area::Writing => "writing",
            Area::Error => "error",
        };
        f.write_str(s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub agent_id: String,
    pub name: String,
    pub is_main: bool,
    pub state: AgentState,
    pub detail: String,
    pub area: Area,
    pub framework: String,
    pub join_key: String,
    pub online: bool,
    pub auth_status: String,
    pub avatar: String,
    pub last_push_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPublicView {
    pub agent_id: String,
    pub name: String,
    pub is_main: bool,
    pub state: AgentState,
    pub detail: String,
    pub area: Area,
    pub framework: String,
    pub online: bool,
    pub auth_status: String,
    pub avatar: String,
}

impl From<&Agent> for AgentPublicView {
    fn from(a: &Agent) -> Self {
        AgentPublicView {
            agent_id: a.agent_id.clone(),
            name: a.name.clone(),
            is_main: a.is_main,
            state: a.state,
            detail: a.detail.clone(),
            area: a.area,
            framework: a.framework.clone(),
            online: a.online,
            auth_status: a.auth_status.clone(),
            avatar: a.avatar.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinKey {
    pub key: String,
    pub max_concurrent: u32,
    pub reusable: bool,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MainState {
    pub state: AgentState,
    pub detail: String,
    pub progress: u8,
    pub updated_at: String,
}

// --- Multi-Channel Types ---

/// Channel type: public or private
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Public,
    Private,
}

impl std::fmt::Display for ChannelType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChannelType::Public => f.write_str("public"),
            ChannelType::Private => f.write_str("private"),
        }
    }
}

impl ChannelType {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "private" => ChannelType::Private,
            _ => ChannelType::Public,
        }
    }
}

/// User (lightweight, token-based identity)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub user_id: String,
    pub name: String,
    pub avatar: String,
    pub created_at: String,
}

/// Bot (AI agent, platform-unique identifier)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bot {
    pub bot_id: String,
    pub name: String,
    pub owner_user_id: Option<String>,
    pub avatar: String,
    pub current_channel_id: Option<String>,
    pub current_agent_id: Option<String>,
    pub online: bool,
    pub created_at: String,
}

/// Bot public view (no sensitive info)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotPublicView {
    pub bot_id: String,
    pub name: String,
    pub avatar: String,
    pub online: bool,
}

impl From<&Bot> for BotPublicView {
    fn from(b: &Bot) -> Self {
        BotPublicView {
            bot_id: b.bot_id.clone(),
            name: b.name.clone(),
            avatar: b.avatar.clone(),
            online: b.online,
        }
    }
}

/// Channel (room)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub channel_id: String,
    pub name: String,
    pub owner_user_id: Option<String>,
    pub channel_type: ChannelType,
    pub join_key: Option<String>,
    pub whitelist: Vec<String>,  // list of botIds for private channels
    pub max_members: u32,
    pub layout: String,  // JSON string
    pub is_public: bool,
    pub is_default: bool,
    pub created_at: String,
}

/// Channel public view (for lobby listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPublicView {
    pub channel_id: String,
    pub name: String,
    pub channel_type: ChannelType,
    pub is_public: bool,
    pub max_members: u32,
    pub online_count: u32,
    pub has_password: bool,
}

impl ChannelPublicView {
    pub fn from_channel(c: &Channel, online_count: u32) -> Self {
        ChannelPublicView {
            channel_id: c.channel_id.clone(),
            name: c.name.clone(),
            channel_type: c.channel_type,
            is_public: c.is_public,
            max_members: c.max_members,
            online_count,
            has_password: c.join_key.is_some(),
        }
    }
}

/// Channel member (bot presence in a channel)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMember {
    pub channel_id: String,
    pub bot_id: String,
    pub agent_id: String,
    pub state: AgentState,
    pub detail: String,
    pub area: Area,
    pub online: bool,
    pub last_push_at: String,
    pub joined_at: String,
}

/// Channel member public view (for agent list)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMemberView {
    pub agent_id: String,
    pub bot_id: String,
    pub name: String,
    pub avatar: String,
    pub state: AgentState,
    pub detail: String,
    pub area: Area,
    pub online: bool,
}
