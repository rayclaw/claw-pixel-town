mod config;
mod routes;
mod channel_routes;
mod game_routes;
mod oauth_routes;
mod background;
mod events;

use std::sync::Arc;
use std::net::SocketAddr;
use axum::Router;
use axum::routing::get;
use axum::response::{Html, IntoResponse};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor};
use pixel_town_core::db::Database;

pub struct AppState {
    pub db: Database,
    pub config: config::AppConfig,
    pub events: events::EventHub,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,star_office=debug".into()),
        )
        .init();

    let cfg = config::load_config();
    tracing::info!("Starting star-office on {}:{}", cfg.server.host, cfg.server.port);

    let db = Database::new(&cfg.storage.db_path).expect("Failed to open database");
    db.ensure_main_agent("Star").expect("Failed to ensure main agent");
    db.ensure_default_channel("Main Office").expect("Failed to ensure default channel");

    let event_hub = events::EventHub::new();
    let state = Arc::new(AppState { db, config: cfg.clone(), events: event_hub });

    // Spawn background tasks
    background::spawn_presence_task(state.clone());
    background::spawn_game_timeout_task(state.clone());

    // Configure rate limiting: requests per minute per IP
    let governor_conf = GovernorConfigBuilder::default()
        .per_second(cfg.security.rate_limit_per_minute as u64 / 60)
        .burst_size(cfg.security.rate_limit_per_minute)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .unwrap();

    // Background task to clean up expired rate limit entries
    let governor_limiter = governor_conf.limiter().clone();
    let interval = std::time::Duration::from_secs(60);
    std::thread::spawn(move || loop {
        std::thread::sleep(interval);
        governor_limiter.retain_recent();
    });

    let governor_conf = Arc::new(governor_conf);

    let static_dir = cfg.server.static_dir.clone();
    let app = Router::new()
        .merge(routes::api_routes())
        .merge(channel_routes::channel_routes())
        .merge(channel_routes::bot_routes())
        .merge(channel_routes::user_routes())
        .merge(channel_routes::lobby_routes())
        .merge(game_routes::game_routes())
        .merge(oauth_routes::oauth_routes())
        .nest_service("/static", ServeDir::new(&cfg.server.static_dir))
        .route("/", get(move || {
            let dir = static_dir.clone();
            async move {
                match tokio::fs::read_to_string(format!("{}/index.html", dir)).await {
                    Ok(html) => Html(html).into_response(),
                    Err(_) => Html("<h1>index.html not found</h1>".to_string()).into_response(),
                }
            }
        }))
        .layer(GovernorLayer { config: governor_conf })
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("{}:{}", cfg.server.host, cfg.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("Listening on {} (rate limit: {} req/min per IP)", addr, cfg.security.rate_limit_per_minute);

    // Use into_make_service_with_connect_info for IP extraction
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}
