use std::sync::Arc;
use axum::{
    Router,
    extract::{State, Query},
    http::StatusCode,
    response::{Json, Redirect},
    routing::get,
};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::routes::{err, AppResult, ErrorResponse};

// =============================================================================
// OAuth Routes
// =============================================================================

pub fn oauth_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/auth/github", get(github_login))
        .route("/auth/github/callback", get(github_callback))
        .route("/auth/me", get(get_auth_me))
        .route("/auth/logout", get(logout))
}

// =============================================================================
// GitHub OAuth
// =============================================================================

/// Redirect to GitHub OAuth authorization page
async fn github_login(
    State(state): State<Arc<AppState>>,
) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
    let client_id = state.config.oauth.github_client_id.as_ref()
        .ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "GitHub OAuth not configured"))?;

    let redirect_uri = format!(
        "https://github.com/login/oauth/authorize?client_id={}&scope=read:user",
        client_id
    );

    Ok(Redirect::temporary(&redirect_uri))
}

#[derive(Deserialize)]
struct GitHubCallbackQuery {
    code: String,
}

#[derive(Deserialize)]
struct GitHubTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GitHubUser {
    id: i64,
    login: String,
    avatar_url: String,
}

#[allow(dead_code)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
    user_token: String,
    user: AuthUser,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthUser {
    user_id: String,
    name: String,
    avatar: String,
    github_id: Option<i64>,
    github_login: Option<String>,
    github_avatar_url: Option<String>,
}

/// GitHub OAuth callback - exchange code for token and create/update user
async fn github_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GitHubCallbackQuery>,
) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
    let client_id = state.config.oauth.github_client_id.as_ref()
        .ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "GitHub OAuth not configured"))?;
    let client_secret = state.config.oauth.github_client_secret.as_ref()
        .ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "GitHub OAuth not configured"))?;

    // Exchange code for access token
    let client = reqwest::Client::new();
    let token_resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", &query.code),
        ])
        .send()
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("GitHub token exchange failed: {}", e)))?;

    let token_data: GitHubTokenResponse = token_resp.json().await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("Invalid GitHub token response: {}", e)))?;

    // Get user info from GitHub
    let user_resp = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token_data.access_token))
        .header("User-Agent", "small-town")
        .send()
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("GitHub user info failed: {}", e)))?;

    let github_user: GitHubUser = user_resp.json().await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("Invalid GitHub user response: {}", e)))?;

    // Check if user already exists with this GitHub ID
    let existing_user = state.db.get_user_by_github_id(github_user.id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_token = if let Some(user) = existing_user {
        // User exists, return their token
        user.user_id
    } else {
        // Create new user with GitHub info
        let user_token = format!("gh_{}", github_user.id);
        let now = chrono::Utc::now().to_rfc3339();

        let user = star_office_core::types::User {
            user_id: user_token.clone(),
            name: github_user.login.clone(),
            avatar: "default".to_string(),
            github_id: Some(github_user.id),
            github_login: Some(github_user.login),
            github_avatar_url: Some(github_user.avatar_url),
            created_at: now,
        };

        state.db.create_user(&user)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        user_token
    };

    // Redirect back to frontend with token in hash
    let redirect_url = format!("/#/login-success?token={}", user_token);
    Ok(Redirect::temporary(&redirect_url))
}

/// Get current authenticated user info
async fn get_auth_me(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<AuthUser>> {
    let user_token = headers
        .get("x-user-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "User token required"))?;

    let user = state.db.get_user(user_token)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "User not found"))?;

    Ok(Json(AuthUser {
        user_id: user.user_id,
        name: user.name,
        avatar: user.avatar,
        github_id: user.github_id,
        github_login: user.github_login,
        github_avatar_url: user.github_avatar_url,
    }))
}

/// Logout (just returns success, client clears token)
async fn logout() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}
