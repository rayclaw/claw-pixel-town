use std::sync::Arc;
use axum::{
    Router,
    extract::State,
    extract::Path,
    http::{StatusCode, HeaderMap},
    response::Json,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use star_office_core::types::*;

use crate::AppState;

pub type AppResult<T> = Result<T, (StatusCode, Json<ErrorResponse>)>;

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<ErrorResponse>) {
    (status, Json(ErrorResponse { error: msg.into() }))
}

// --- Input Validation ---

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_DETAIL_LEN: usize = 256;

pub fn sanitize_string(s: &str, max_len: usize) -> String {
    // Strip HTML tags and limit length
    let stripped: String = s.chars()
        .filter(|c| *c != '<' && *c != '>')
        .take(max_len)
        .collect();
    stripped.trim().to_string()
}

pub fn validate_name(name: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let sanitized = sanitize_string(name, MAX_NAME_LEN);
    if sanitized.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Name cannot be empty"));
    }
    Ok(sanitized)
}

fn validate_detail(detail: &str) -> String {
    sanitize_string(detail, MAX_DETAIL_LEN)
}

// --- Admin Auth ---

fn check_admin_token(headers: &HeaderMap, expected: &Option<String>) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    let Some(expected_token) = expected else {
        // No admin token configured, allow all requests
        return Ok(());
    };

    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = auth_header.strip_prefix("Bearer ").unwrap_or(auth_header);

    if token == expected_token {
        Ok(())
    } else {
        Err(err(StatusCode::UNAUTHORIZED, "Invalid or missing admin token"))
    }
}

pub fn api_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/version", get(get_version))
        .route("/status", get(get_status))
        .route("/set_state", post(set_state))
        .route("/agents", get(get_agents))
        .route("/agents/{id}", get(get_agent_detail))
        .route("/join", post(join_agent))
        .route("/join-agent", post(join_agent))
        .route("/push", post(agent_push))
        .route("/agent-push", post(agent_push))
        .route("/leave", post(leave_agent))
        .route("/leave-agent", post(leave_agent))
        .route("/broadcast", post(broadcast_state))
}

// --- Health ---

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

// --- Version ---

async fn get_version() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "commitId": option_env!("GIT_COMMIT_SHORT").unwrap_or("dev"),
        "buildDate": option_env!("BUILD_DATE").unwrap_or("unknown"),
        "repoUrl": "https://github.com/rayclaw/claw-pixel-town",
        "skillUrl": "https://github.com/rayclaw/claw-pixel-town/blob/main/skills/claw-pixel-town/SKILL.md",
        "tagline": "Create your agent room",
        "changes": [
            "Add joke danmaku feature",
            "Add emoji social interactions",
            "Improve panel UI consistency",
            "Add bot rename functionality",
            "Require login for non-default rooms"
        ]
    }))
}

// --- Main State ---

async fn get_status(State(state): State<Arc<AppState>>) -> AppResult<Json<MainState>> {
    state.db.get_main_state()
        .map(Json)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
struct SetStateRequest {
    state: String,
    #[serde(default)]
    detail: String,
}

async fn set_state(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SetStateRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Admin auth required
    check_admin_token(&headers, &state.config.security.admin_token)?;

    let detail = validate_detail(&body.detail);
    state.db.set_main_state(&body.state, &detail)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    // Also sync to main agent
    let _ = state.db.sync_main_agent_state();
    Ok(Json(serde_json::json!({ "ok": true })))
}

// --- Agents ---

async fn get_agents(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<AgentPublicView>>> {
    let agents = state.db.get_all_agents()
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let views: Vec<AgentPublicView> = agents.iter().map(AgentPublicView::from).collect();
    Ok(Json(views))
}

async fn get_agent_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<AgentPublicView>> {
    match state.db.get_agent(&id) {
        Ok(Some(agent)) => Ok(Json(AgentPublicView::from(&agent))),
        Ok(None) => Err(err(StatusCode::NOT_FOUND, "Agent not found")),
        Err(e) => Err(err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

// --- Join ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinRequest {
    name: String,
    join_key: String,
    #[serde(default = "default_framework")]
    framework: String,
}

fn default_framework() -> String { "unknown".into() }

async fn join_agent(
    State(state): State<Arc<AppState>>,
    Json(body): Json<JoinRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Validate input
    let name = validate_name(&body.name)?;

    // Validate join key
    let jk = state.db.get_join_key(&body.join_key)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::FORBIDDEN, "Invalid join key"))?;

    // Check expiry
    if let Some(ref exp) = jk.expires_at {
        if let Ok(exp_time) = chrono::DateTime::parse_from_rfc3339(exp) {
            if chrono::Utc::now() > exp_time {
                return Err(err(StatusCode::FORBIDDEN, "Join key expired"));
            }
        }
    }

    // Check concurrency
    let current = state.db.count_online_agents_by_key(&body.join_key)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if current >= jk.max_concurrent {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "Key at capacity"));
    }

    // Create agent
    let agent_id = format!("agent_{}_{}", chrono::Utc::now().timestamp(), &uuid::Uuid::new_v4().to_string()[..8]);
    let avatar_num = (current % 6) + 1;
    let now = chrono::Utc::now().to_rfc3339();

    let agent = Agent {
        agent_id: agent_id.clone(),
        name: name.clone(),
        is_main: false,
        state: AgentState::Idle,
        detail: String::new(),
        area: Area::Breakroom,
        framework: sanitize_string(&body.framework, MAX_NAME_LEN),
        join_key: body.join_key.clone(),
        online: true,
        auth_status: "approved".into(),
        avatar: format!("guest_role_{}", avatar_num),
        last_push_at: now.clone(),
        created_at: now,
    };

    state.db.insert_agent(&agent)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Agent joined: {} ({}) via key {}", name, agent_id, body.join_key);

    Ok(Json(serde_json::json!({
        "agentId": agent_id,
        "name": name,
        "authStatus": "approved",
        "avatar": agent.avatar,
    })))
}

// --- Push ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushRequest {
    agent_id: String,
    join_key: String,
    #[serde(default = "default_idle")]
    state: String,
    #[serde(default)]
    detail: String,
}

fn default_idle() -> String { "idle".into() }

async fn agent_push(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PushRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Verify agent exists and key matches
    let agent = state.db.get_agent(&body.agent_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Agent not found"))?;

    if agent.join_key != body.join_key {
        return Err(err(StatusCode::FORBIDDEN, "Invalid join key for this agent"));
    }

    let detail = validate_detail(&body.detail);
    let normalized = AgentState::from_str_normalized(&body.state);
    state.db.update_agent_state(&body.agent_id, normalized, &detail)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// --- Leave ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeaveRequest {
    agent_id: String,
    join_key: String,
}

async fn leave_agent(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LeaveRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let agent = state.db.get_agent(&body.agent_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Agent not found"))?;

    if agent.join_key != body.join_key {
        return Err(err(StatusCode::FORBIDDEN, "Invalid join key for this agent"));
    }

    state.db.remove_agent(&body.agent_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Agent left: {} ({})", agent.name, body.agent_id);

    Ok(Json(serde_json::json!({ "ok": true })))
}

// --- Broadcast ---

async fn broadcast_state(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SetStateRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Admin auth required
    check_admin_token(&headers, &state.config.security.admin_token)?;

    let detail = validate_detail(&body.detail);
    let normalized = star_office_core::types::AgentState::from_str_normalized(&body.state);
    let count = state.db.broadcast_agent_state(normalized, &detail)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true, "updated": count })))
}
