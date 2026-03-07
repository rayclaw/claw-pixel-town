mod config;
mod routes;
mod background;

use std::sync::Arc;
use axum::Router;
use axum::routing::get;
use axum::response::{Html, IntoResponse};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use star_office_core::db::Database;

pub struct AppState {
    pub db: Database,
    pub config: config::AppConfig,
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

    let state = Arc::new(AppState { db, config: cfg.clone() });

    // Spawn background presence task
    background::spawn_presence_task(state.clone());

    let static_dir = cfg.server.static_dir.clone();
    let app = Router::new()
        .merge(routes::api_routes())
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
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("{}:{}", cfg.server.host, cfg.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("Listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
