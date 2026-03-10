use std::sync::Arc;
use std::convert::Infallible;
use std::time::Duration;
use axum::{
    Router,
    extract::{State, Path},
    http::{StatusCode, HeaderMap},
    response::{Json, Sse, sse::Event},
    routing::{get, post, delete, patch},
};
use serde::{Deserialize, Serialize};
use star_office_core::types::*;
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use futures::stream::Stream;

use crate::AppState;
use crate::routes::{err, AppResult, MAX_NAME_LEN, MAX_DETAIL_LEN, sanitize_string, validate_name};
use crate::events::{ChannelEvent, ActionType, EmojiKey};

// =============================================================================
// User Identity Helpers
// =============================================================================

const USER_TOKEN_HEADER: &str = "x-user-token";

fn get_user_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(USER_TOKEN_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

fn require_user_token(headers: &HeaderMap) -> Result<String, (StatusCode, Json<crate::routes::ErrorResponse>)> {
    get_user_token(headers).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "User token required"))
}

// =============================================================================
// Channel Routes
// =============================================================================

pub fn channel_routes() -> Router<Arc<AppState>> {
    Router::new()
        // Channel CRUD
        .route("/channels", post(create_channel))
        .route("/channels", get(list_channels))
        .route("/channels/:id", get(get_channel))
        .route("/channels/:id", patch(update_channel))
        .route("/channels/:id", delete(delete_channel))
        // Channel operations
        .route("/channels/:id/join", post(join_channel))
        .route("/channels/:id/leave", post(leave_channel))
        .route("/channels/:id/push", post(push_channel))
        .route("/channels/:id/agents", get(list_channel_agents))
        // Channel layout
        .route("/channels/:id/layout", get(get_channel_layout))
        .route("/channels/:id/layout", post(save_channel_layout))
        // Agent actions (social interactions)
        .route("/channels/:id/action", post(channel_action))
        // SSE events
        .route("/channels/:id/events", get(channel_events_sse))
        // Whitelist (private channels)
        .route("/channels/:id/whitelist", get(get_whitelist))
        .route("/channels/:id/whitelist", post(set_whitelist))
        .route("/channels/:id/whitelist/add", post(add_to_whitelist))
        .route("/channels/:id/whitelist/:botId", delete(remove_from_whitelist))
}

// =============================================================================
// Bot Routes
// =============================================================================

pub fn bot_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/bots", post(create_bot))
        .route("/bots", get(list_bots))
        .route("/bots/:id", get(get_bot))
        .route("/bots/:id", patch(update_bot))
        .route("/bots/:id", delete(delete_bot))
}

// =============================================================================
// User Routes
// =============================================================================

pub fn user_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/user", get(get_current_user))
        .route("/user", patch(update_user))
}

// =============================================================================
// Lobby Routes
// =============================================================================

pub fn lobby_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/lobby", get(get_lobby))
        .route("/lobby/stats", get(get_lobby_stats))
}

// =============================================================================
// Channel CRUD Handlers
// =============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateChannelRequest {
    name: String,
    #[serde(default)]
    join_key: Option<String>,
    #[serde(default = "default_max_members")]
    max_members: u32,
    #[serde(default = "default_true")]
    is_public: bool,
    #[serde(default)]
    channel_type: Option<String>,
}

fn default_max_members() -> u32 { 20 }
fn default_true() -> bool { true }

async fn create_channel(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateChannelRequest>,
) -> AppResult<Json<Channel>> {
    let user_token = require_user_token(&headers)?;

    // Ensure user exists
    let user = state.db.get_or_create_user(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Only GitHub-authenticated users can create rooms
    if user.github_id.is_none() {
        return Err(err(StatusCode::FORBIDDEN, "Please login with GitHub to create a room"));
    }

    // Check room creation limit
    let room_count = state.db.count_user_channels(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let max_rooms = state.config.oauth.max_rooms_per_user;
    if room_count >= max_rooms {
        return Err(err(StatusCode::FORBIDDEN, format!("Room limit reached (max {})", max_rooms)));
    }

    let name = validate_name(&body.name)?;
    let channel_id = format!("ch_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let channel_type = match body.channel_type.as_deref() {
        Some("private") => ChannelType::Private,
        _ => ChannelType::Public,
    };

    let channel = Channel {
        channel_id: channel_id.clone(),
        name,
        owner_user_id: Some(user_token),
        channel_type,
        join_key: body.join_key,
        whitelist: vec![],
        max_members: body.max_members,
        layout: "{}".to_string(),
        is_public: body.is_public,
        is_default: false,
        created_at: now,
    };

    state.db.create_channel(&channel)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Channel created: {} ({})", channel.name, channel_id);

    Ok(Json(channel))
}

async fn list_channels(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ChannelPublicView>>> {
    let channels = state.db.get_public_channels()
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut views = Vec::with_capacity(channels.len());
    for c in &channels {
        let count = state.db.count_online_channel_members(&c.channel_id)
            .unwrap_or(0);
        // Get owner avatar if channel has an owner
        let owner_avatar = if let Some(ref owner_id) = c.owner_user_id {
            state.db.get_user(owner_id).ok().flatten().and_then(|u| u.github_avatar_url)
        } else {
            None
        };
        views.push(ChannelPublicView::from_channel(c, count, owner_avatar));
    }

    Ok(Json(views))
}

async fn get_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Channel>> {
    match state.db.get_channel(&id) {
        Ok(Some(mut channel)) => {
            // Don't expose whitelist to non-owners (simplified: just clear it for public view)
            channel.whitelist = vec![];
            Ok(Json(channel))
        }
        Ok(None) => Err(err(StatusCode::NOT_FOUND, "Channel not found")),
        Err(e) => Err(err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateChannelRequest {
    name: Option<String>,
    is_public: Option<bool>,
    max_members: Option<u32>,
}

async fn update_channel(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<UpdateChannelRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can update"));
    }

    let name = body.name.map(|n| sanitize_string(&n, MAX_NAME_LEN)).unwrap_or(channel.name.clone());
    let is_public = body.is_public.unwrap_or(channel.is_public);
    let max_members = body.max_members.unwrap_or(channel.max_members);

    state.db.update_channel(&id, &name, is_public, max_members)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit channel update event
    state.events.send(&id, ChannelEvent::ChannelUpdate {
        name: name.clone(),
        is_public,
        max_members,
    }).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_channel(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can delete"));
    }

    // Can't delete default channel
    if channel.is_default {
        return Err(err(StatusCode::FORBIDDEN, "Cannot delete default channel"));
    }

    state.db.delete_channel(&id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Channel deleted: {}", id);

    Ok(Json(serde_json::json!({ "ok": true })))
}

// =============================================================================
// Channel Join/Leave/Push Handlers
// =============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinChannelRequest {
    bot_id: String,
    #[serde(default)]
    join_key: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoinChannelResponse {
    agent_id: String,
    channel_id: String,
    reconnected: bool,
}

async fn join_channel(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    Json(body): Json<JoinChannelRequest>,
) -> AppResult<Json<JoinChannelResponse>> {
    // Get channel
    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Validate join key if channel has one
    if let Some(ref expected_key) = channel.join_key {
        let provided_key = body.join_key.as_deref().unwrap_or("");
        if provided_key != expected_key {
            return Err(err(StatusCode::FORBIDDEN, "Invalid join key"));
        }
    }

    // Get bot
    let bot = state.db.get_bot(&body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    // Check whitelist for private channels
    if channel.channel_type == ChannelType::Private {
        if !channel.whitelist.contains(&body.bot_id) {
            return Err(err(StatusCode::FORBIDDEN, "Bot not in channel whitelist"));
        }
    }

    // Check if bot is already in another channel
    if let Some(ref current_ch) = bot.current_channel_id {
        if current_ch != &channel_id {
            return Err(err(StatusCode::CONFLICT, "Bot already in another channel, leave first"));
        }
        // Reconnecting to same channel
        if let Some(ref agent_id) = bot.current_agent_id {
            // Update member state
            state.db.update_channel_member_state(&channel_id, &body.bot_id, AgentState::Idle, "")
                .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            return Ok(Json(JoinChannelResponse {
                agent_id: agent_id.clone(),
                channel_id,
                reconnected: true,
            }));
        }
    }

    // Check max members
    let current_count = state.db.count_online_channel_members(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if current_count >= channel.max_members {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "Channel at capacity"));
    }

    // Create new agent for this bot
    let agent_id = format!("agent_{}_{}", chrono::Utc::now().timestamp_millis(), &body.bot_id[4..].chars().take(6).collect::<String>());
    let now = chrono::Utc::now().to_rfc3339();

    let member = ChannelMember {
        channel_id: channel_id.clone(),
        bot_id: body.bot_id.clone(),
        agent_id: agent_id.clone(),
        state: AgentState::Idle,
        detail: String::new(),
        area: Area::Breakroom,
        online: true,
        last_push_at: now.clone(),
        joined_at: now,
    };

    state.db.add_channel_member(&member)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update bot's current channel
    state.db.update_bot_channel(&body.bot_id, Some(&channel_id), Some(&agent_id))
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit agent join event
    state.events.send(&channel_id, ChannelEvent::AgentJoin {
        agent_id: agent_id.clone(),
        bot_id: body.bot_id.clone(),
        name: bot.name.clone(),
        avatar: bot.avatar.clone(),
    }).await;

    tracing::info!("Bot {} joined channel {} as agent {}", body.bot_id, channel_id, agent_id);

    Ok(Json(JoinChannelResponse {
        agent_id,
        channel_id,
        reconnected: false,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeaveChannelRequest {
    bot_id: String,
}

async fn leave_channel(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    Json(body): Json<LeaveChannelRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Verify bot is in this channel
    let bot = state.db.get_bot(&body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    if bot.current_channel_id.as_ref() != Some(&channel_id) {
        return Err(err(StatusCode::BAD_REQUEST, "Bot not in this channel"));
    }

    // Get agent_id before removing
    let agent_id = bot.current_agent_id.clone().unwrap_or_default();

    // Remove from channel_members
    state.db.remove_channel_member(&channel_id, &body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Clear bot's current channel
    state.db.update_bot_channel(&body.bot_id, None, None)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit agent leave event
    state.events.send(&channel_id, ChannelEvent::AgentLeave {
        agent_id,
        bot_id: body.bot_id.clone(),
    }).await;

    tracing::info!("Bot {} left channel {}", body.bot_id, channel_id);

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushChannelRequest {
    bot_id: String,
    #[serde(default = "default_idle_str")]
    state: String,
    #[serde(default)]
    detail: String,
}

fn default_idle_str() -> String { "idle".to_string() }

async fn push_channel(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    Json(body): Json<PushChannelRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // Verify bot is in this channel
    let bot = state.db.get_bot(&body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    if bot.current_channel_id.as_ref() != Some(&channel_id) {
        return Err(err(StatusCode::BAD_REQUEST, "Bot not in this channel"));
    }

    let detail = sanitize_string(&body.detail, MAX_DETAIL_LEN);
    let agent_state = AgentState::from_str_normalized(&body.state);

    state.db.update_channel_member_state(&channel_id, &body.bot_id, agent_state.clone(), &detail)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit agent state event
    let agent_id = bot.current_agent_id.clone().unwrap_or_default();
    state.events.send(&channel_id, ChannelEvent::AgentState {
        agent_id,
        bot_id: body.bot_id.clone(),
        state: agent_state.to_string(),
        detail: detail.clone(),
        area: "breakroom".to_string(), // Default area
    }).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// =============================================================================
// Agent Action Handler (Social Interactions)
// =============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionRequest {
    bot_id: String,
    #[serde(rename = "type")]
    action_type: ActionType,
    #[serde(default)]
    target_bot_id: Option<String>,
    // Emoji-specific field
    #[serde(default)]
    emoji: Option<EmojiKey>,
    // Joke-specific field
    #[serde(default)]
    content: Option<String>,
}

const MAX_JOKE_LENGTH: usize = 150;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionResponse {
    ok: bool,
    action_type: ActionType,
    emoji_display: Option<String>,
}

async fn channel_action(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    Json(body): Json<ActionRequest>,
) -> AppResult<Json<ActionResponse>> {
    // Verify bot exists and is in this channel
    let bot = state.db.get_bot(&body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    if bot.current_channel_id.as_ref() != Some(&channel_id) {
        return Err(err(StatusCode::BAD_REQUEST, "Bot not in this channel"));
    }

    // Validate action-specific requirements
    let (emoji_display, joke_content) = match body.action_type {
        ActionType::Emoji => {
            let emoji_key = body.emoji
                .ok_or_else(|| err(StatusCode::BAD_REQUEST, "emoji field required for emoji action"))?;
            (Some(emoji_key.to_emoji().to_string()), None)
        }
        ActionType::Joke => {
            let content = body.content
                .ok_or_else(|| err(StatusCode::BAD_REQUEST, "content field required for joke action"))?;
            // Validate joke length
            if content.len() > MAX_JOKE_LENGTH {
                return Err(err(StatusCode::BAD_REQUEST, format!("Joke too long (max {} chars)", MAX_JOKE_LENGTH)));
            }
            // Basic content filter - no code blocks
            if content.contains("```") || content.contains("<script") {
                return Err(err(StatusCode::BAD_REQUEST, "Invalid content"));
            }
            // Sanitize: trim and limit
            let sanitized = content.trim().chars().take(MAX_JOKE_LENGTH).collect::<String>();
            (None, Some(sanitized))
        }
    };

    // If targeting another bot, verify they're in the same channel
    if let Some(ref target_id) = body.target_bot_id {
        let target_bot = state.db.get_bot(target_id)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "Target bot not found"))?;

        if target_bot.current_channel_id.as_ref() != Some(&channel_id) {
            return Err(err(StatusCode::BAD_REQUEST, "Target bot not in this channel"));
        }
    }

    // Emit action event to channel
    state.events.send(&channel_id, ChannelEvent::Action {
        action_type: body.action_type,
        from_bot_id: body.bot_id.clone(),
        from_name: bot.name.clone(),
        target_bot_id: body.target_bot_id.clone(),
        emoji: body.emoji,
        joke_content,
    }).await;

    tracing::info!(
        "Action {:?} from {} in channel {} (target: {:?})",
        body.action_type, body.bot_id, channel_id, body.target_bot_id
    );

    Ok(Json(ActionResponse {
        ok: true,
        action_type: body.action_type,
        emoji_display,
    }))
}

// =============================================================================
// Channel Member List Handler
// =============================================================================

async fn list_channel_agents(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> AppResult<Json<Vec<ChannelMemberView>>> {
    // Verify channel exists
    state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    let members = state.db.get_online_channel_members(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Enrich with bot info
    let mut views = Vec::with_capacity(members.len());
    for m in members {
        if let Ok(Some(bot)) = state.db.get_bot(&m.bot_id) {
            views.push(ChannelMemberView {
                agent_id: m.agent_id,
                bot_id: m.bot_id,
                name: bot.name,
                avatar: bot.avatar,
                state: m.state,
                detail: m.detail,
                area: m.area,
                online: m.online,
            });
        }
    }

    Ok(Json(views))
}

// =============================================================================
// Channel Layout Handlers
// =============================================================================

async fn get_channel_layout(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    let layout: serde_json::Value = serde_json::from_str(&channel.layout)
        .unwrap_or(serde_json::json!({}));

    Ok(Json(layout))
}

#[derive(Deserialize)]
struct SaveLayoutRequest {
    layout: serde_json::Value,
}

async fn save_channel_layout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Json(body): Json<SaveLayoutRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can update layout"));
    }

    let layout_str = serde_json::to_string(&body.layout)
        .map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;

    state.db.update_channel_layout(&channel_id, &layout_str)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit layout update event
    state.events.send(&channel_id, ChannelEvent::LayoutUpdate {
        layout: body.layout,
    }).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// =============================================================================
// SSE Event Stream
// =============================================================================

async fn channel_events_sse(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.events.subscribe(&channel_id).await;

    // Convert broadcast receiver to a stream
    let event_stream = BroadcastStream::new(rx)
        .filter_map(|result| {
            match result {
                Ok(event) => Some(event),
                Err(_) => None, // Skip lagged messages
            }
        })
        .map(|event| {
            let json = serde_json::to_string(&event).unwrap_or_default();
            let event_type = match &event {
                ChannelEvent::AgentJoin { .. } => "agent_join",
                ChannelEvent::AgentLeave { .. } => "agent_leave",
                ChannelEvent::AgentState { .. } => "agent_state",
                ChannelEvent::LayoutUpdate { .. } => "layout_update",
                ChannelEvent::ChannelUpdate { .. } => "channel_update",
                ChannelEvent::Action { .. } => "action",
                ChannelEvent::Keepalive => "keepalive",
            };
            Ok::<_, Infallible>(Event::default().event(event_type).data(json))
        });

    // Keepalive is handled by axum's built-in KeepAlive
    Sse::new(event_stream)
        .keep_alive(axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("keepalive"))
}

// =============================================================================
// Whitelist Handlers
// =============================================================================

async fn get_whitelist(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
) -> AppResult<Json<Vec<String>>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can view whitelist"));
    }

    Ok(Json(channel.whitelist))
}

#[derive(Deserialize)]
struct SetWhitelistRequest {
    whitelist: Vec<String>,
}

async fn set_whitelist(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Json(body): Json<SetWhitelistRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can update whitelist"));
    }

    // Limit whitelist size
    if body.whitelist.len() > 100 {
        return Err(err(StatusCode::BAD_REQUEST, "Whitelist cannot exceed 100 entries"));
    }

    state.db.update_channel_whitelist(&channel_id, &body.whitelist)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddToWhitelistRequest {
    bot_id: String,
}

async fn add_to_whitelist(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Json(body): Json<AddToWhitelistRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can update whitelist"));
    }

    let mut whitelist = channel.whitelist;
    if whitelist.len() >= 100 {
        return Err(err(StatusCode::BAD_REQUEST, "Whitelist is full"));
    }

    if !whitelist.contains(&body.bot_id) {
        whitelist.push(body.bot_id);
        state.db.update_channel_whitelist(&channel_id, &whitelist)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn remove_from_whitelist(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((channel_id, bot_id)): Path<(String, String)>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let channel = state.db.get_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Channel not found"))?;

    // Check ownership
    if channel.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only channel owner can update whitelist"));
    }

    let whitelist: Vec<String> = channel.whitelist.into_iter()
        .filter(|id| id != &bot_id)
        .collect();

    state.db.update_channel_whitelist(&channel_id, &whitelist)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// =============================================================================
// Bot Handlers
// =============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBotRequest {
    name: String,
}

async fn create_bot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateBotRequest>,
) -> AppResult<Json<Bot>> {
    let user_token = require_user_token(&headers)?;

    // Ensure user exists
    let user = state.db.get_or_create_user(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Only GitHub-authenticated users can create bots
    if user.github_id.is_none() {
        return Err(err(StatusCode::FORBIDDEN, "Please login with GitHub to create a bot"));
    }

    // Check bot creation limit
    let bot_count = state.db.count_user_bots(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let max_bots = state.config.oauth.max_bots_per_user;
    if bot_count >= max_bots {
        return Err(err(StatusCode::FORBIDDEN, format!("Bot limit reached (max {})", max_bots)));
    }

    let name = validate_name(&body.name)?;
    let bot_id = format!("bot_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let bot = Bot {
        bot_id: bot_id.clone(),
        name,
        owner_user_id: Some(user_token),
        avatar: "bot_default".to_string(),
        current_channel_id: None,
        current_agent_id: None,
        online: false,
        created_at: now,
    };

    state.db.create_bot(&bot)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Bot created: {} ({})", bot.name, bot_id);

    Ok(Json(bot))
}

async fn list_bots(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<Bot>>> {
    let user_token = require_user_token(&headers)?;

    let bots = state.db.get_bots_by_owner(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(bots))
}

async fn get_bot(
    State(state): State<Arc<AppState>>,
    Path(bot_id): Path<String>,
) -> AppResult<Json<BotPublicView>> {
    match state.db.get_bot(&bot_id) {
        Ok(Some(bot)) => Ok(Json(BotPublicView::from(&bot))),
        Ok(None) => Err(err(StatusCode::NOT_FOUND, "Bot not found")),
        Err(e) => Err(err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBotRequest {
    name: Option<String>,
    avatar: Option<String>,
}

async fn update_bot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(bot_id): Path<String>,
    Json(body): Json<UpdateBotRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let bot = state.db.get_bot(&bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    // Check ownership
    if bot.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only bot owner can update"));
    }

    let name = body.name.map(|n| sanitize_string(&n, MAX_NAME_LEN)).unwrap_or(bot.name);
    let avatar = body.avatar.map(|a| sanitize_string(&a, MAX_NAME_LEN)).unwrap_or(bot.avatar);

    state.db.update_bot(&bot_id, &name, &avatar)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Bot updated: {} ({})", name, bot_id);

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_bot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(bot_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let bot = state.db.get_bot(&bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    // Check ownership
    if bot.owner_user_id.as_ref() != Some(&user_token) {
        return Err(err(StatusCode::FORBIDDEN, "Only bot owner can delete"));
    }

    // Remove bot from any channel first
    if let Some(ref channel_id) = bot.current_channel_id {
        state.db.remove_channel_member(channel_id, &bot_id)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    state.db.delete_bot(&bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Bot deleted: {}", bot_id);

    Ok(Json(serde_json::json!({ "ok": true })))
}

// =============================================================================
// User Handlers
// =============================================================================

async fn get_current_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> AppResult<Json<User>> {
    let user_token = require_user_token(&headers)?;

    let user = state.db.get_or_create_user(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(user))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUserRequest {
    name: Option<String>,
    avatar: Option<String>,
}

async fn update_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UpdateUserRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_token = require_user_token(&headers)?;

    let user = state.db.get_or_create_user(&user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let name = body.name.map(|n| sanitize_string(&n, MAX_NAME_LEN)).unwrap_or(user.name);
    let avatar = body.avatar.map(|a| sanitize_string(&a, MAX_NAME_LEN)).unwrap_or(user.avatar);

    state.db.update_user(&user_token, &name, &avatar)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// =============================================================================
// Lobby Handlers
// =============================================================================

/// Lobby response with channels and aggregated data
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LobbyResponse {
    channels: Vec<ChannelPublicView>,
    total_channels: u32,
    total_online: u32,
}

async fn get_lobby(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<LobbyResponse>> {
    let channels = state.db.get_public_channels()
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut views = Vec::with_capacity(channels.len());
    let mut total_online = 0u32;

    for c in &channels {
        let count = state.db.count_online_channel_members(&c.channel_id)
            .unwrap_or(0);
        total_online += count;
        // Get owner avatar if channel has an owner
        let owner_avatar = if let Some(ref owner_id) = c.owner_user_id {
            state.db.get_user(owner_id).ok().flatten().and_then(|u| u.github_avatar_url)
        } else {
            None
        };
        views.push(ChannelPublicView::from_channel(c, count, owner_avatar));
    }

    // Sort by online count descending
    views.sort_by(|a, b| b.online_count.cmp(&a.online_count));

    Ok(Json(LobbyResponse {
        total_channels: views.len() as u32,
        total_online,
        channels: views,
    }))
}

async fn get_lobby_stats(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<LobbyStats>> {
    let stats = state.db.get_lobby_stats()
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(stats))
}
