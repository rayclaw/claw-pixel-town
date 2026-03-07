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
