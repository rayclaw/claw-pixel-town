use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_server")]
    pub server: ServerConfig,
    #[serde(default)]
    pub presence: PresenceConfig,
    #[serde(default)]
    pub storage: StorageConfig,
    #[serde(default)]
    pub security: SecurityConfig,
    #[serde(default)]
    pub oauth: OAuthConfig,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct OAuthConfig {
    /// GitHub OAuth client ID
    #[serde(default)]
    pub github_client_id: Option<String>,
    /// GitHub OAuth client secret
    #[serde(default)]
    pub github_client_secret: Option<String>,
    /// Frontend URL for OAuth redirect (e.g., "http://localhost:5173" for dev)
    /// If not set, uses relative redirect "/#/login-success"
    #[serde(default)]
    pub frontend_url: Option<String>,
    /// Max rooms per user (default: 1)
    #[serde(default = "default_max_rooms")]
    pub max_rooms_per_user: u32,
    /// Max bots per user (default: 5)
    #[serde(default = "default_max_bots")]
    pub max_bots_per_user: u32,
}

fn default_max_rooms() -> u32 { 1 }
fn default_max_bots() -> u32 { 5 }

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    /// Admin token for /set_state and /broadcast endpoints (optional)
    #[serde(default)]
    pub admin_token: Option<String>,
    /// Rate limit: requests per minute per IP (default: 60)
    #[serde(default = "default_rate_limit")]
    pub rate_limit_per_minute: u32,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        SecurityConfig {
            admin_token: None,
            rate_limit_per_minute: default_rate_limit(),
        }
    }
}

fn default_rate_limit() -> u32 { 6000 }

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_static_dir")]
    pub static_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PresenceConfig {
    #[serde(default = "default_300")]
    pub auto_idle_ttl_secs: i64,
    #[serde(default = "default_300")]
    pub auto_offline_ttl_secs: i64,
    #[serde(default = "default_30")]
    pub scan_interval_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageConfig {
    #[serde(default = "default_db_path")]
    pub db_path: String,
}

fn default_server() -> ServerConfig {
    ServerConfig {
        host: default_host(),
        port: default_port(),
        static_dir: default_static_dir(),
    }
}
fn default_host() -> String { "0.0.0.0".into() }
fn default_port() -> u16 { 3800 }
fn default_static_dir() -> String { "static".into() }
fn default_300() -> i64 { 300 }
fn default_30() -> u64 { 30 }
fn default_db_path() -> String { "star-office.db".into() }

impl Default for PresenceConfig {
    fn default() -> Self {
        PresenceConfig {
            auto_idle_ttl_secs: 300,
            auto_offline_ttl_secs: 300,
            scan_interval_secs: 30,
        }
    }
}

impl Default for StorageConfig {
    fn default() -> Self {
        StorageConfig { db_path: default_db_path() }
    }
}

pub fn load_config() -> AppConfig {
    let paths = ["config.toml", "config/config.toml"];
    for path in &paths {
        if let Ok(content) = std::fs::read_to_string(path) {
            match toml::from_str(&content) {
                Ok(cfg) => {
                    tracing::info!("Loaded config from {}", path);
                    return cfg;
                }
                Err(e) => {
                    tracing::warn!("Failed to parse {}: {}", path, e);
                }
            }
        }
    }
    tracing::info!("No config file found, using defaults");
    AppConfig {
        server: default_server(),
        presence: PresenceConfig::default(),
        storage: StorageConfig::default(),
        security: SecurityConfig::default(),
        oauth: OAuthConfig::default(),
    }
}
