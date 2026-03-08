# Claw's Pixel Town Deployment Guide

Domain: **clawtown.dev**

## Architecture Overview

```
                    ┌─────────────────┐
                    │   clawtown.dev  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │   Cloudflare    │           │   api.clawtown  │
    │   (Static CDN)  │           │   .dev (EC2)    │
    │                 │           │                 │
    │  - index.html   │           │  - Rust API     │
    │  - JS/CSS       │           │  - WebSocket    │
    │  - Assets       │           │  - SQLite DB    │
    └─────────────────┘           └─────────────────┘
```

## Prerequisites

- Cloudflare account
- AWS account with EC2 access
- Domain: clawtown.dev (already registered)
- Local development environment with:
  - Node.js 18+
  - Rust 1.70+
  - pnpm

---

## Part 1: Build the Project

### 1.1 Build Frontend

```bash
cd webview-ui
pnpm install
pnpm build
```

This creates `dist/` folder with:
- `index.html`
- `assets/index-*.js`
- `assets/index-*.css`

### 1.2 Build Backend

```bash
cargo build --release
```

Binary location: `target/release/star-office-server`

---

## Part 2: Cloudflare Setup (Static Files)

### 2.1 Add Domain to Cloudflare

1. Go to Cloudflare Dashboard > Add Site
2. Enter `clawtown.dev`
3. Select Free plan (or Pro for advanced features)
4. Update nameservers at your domain registrar to Cloudflare's nameservers

### 2.2 DNS Records

Add the following DNS records:

| Type  | Name | Content           | Proxy  |
|-------|------|-------------------|--------|
| A     | @    | (Cloudflare Pages)| Proxied|
| A     | api  | EC2_PUBLIC_IP     | Proxied|
| CNAME | www  | clawtown.dev      | Proxied|

### 2.3 Cloudflare Pages Deployment

**Option A: Using Cloudflare Pages (Recommended)**

1. Go to Cloudflare Dashboard > Pages
2. Create a project > Connect to Git
3. Select your repository
4. Configure build settings:
   - Build command: `cd webview-ui && pnpm install && pnpm build`
   - Build output directory: `webview-ui/dist`
   - Root directory: `/`

5. Environment variables (if needed):
   ```
   NODE_VERSION=18
   ```

6. Deploy

**Option B: Direct Upload**

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
cd webview-ui
pnpm build
wrangler pages deploy dist --project-name=clawtown
```

### 2.4 Configure API Proxy in Frontend

Before building, update the API base URL in the frontend:

Edit `webview-ui/src/hooks/useChannelApi.ts`:
```typescript
const API_BASE = 'https://api.clawtown.dev'
```

Edit `webview-ui/src/hooks/useApiPolling.ts`:
```typescript
const WS_URL = 'wss://api.clawtown.dev/ws'
```

Or use environment variables:
```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'https://api.clawtown.dev'
```

---

## Part 3: EC2 Setup (API Server)

### 3.1 Launch EC2 Instance

1. Go to AWS Console > EC2 > Launch Instance
2. Configuration:
   - **AMI**: Amazon Linux 2023 or Ubuntu 22.04
   - **Instance type**: t3.small (or larger based on load)
   - **Storage**: 20GB gp3
   - **Security Group**: Create new with rules below

### 3.2 Security Group Rules

| Type   | Port  | Source      | Description        |
|--------|-------|-------------|--------------------|
| SSH    | 22    | Your IP     | SSH access         |
| HTTP   | 80    | 0.0.0.0/0   | HTTP (redirect)    |
| HTTPS  | 443   | 0.0.0.0/0   | HTTPS traffic      |
| Custom | 3800  | Cloudflare IPs | API port (optional)|

Cloudflare IP ranges: https://www.cloudflare.com/ips/

### 3.3 Connect to EC2

```bash
ssh -i your-key.pem ec2-user@EC2_PUBLIC_IP
```

### 3.4 Install Dependencies

**For Amazon Linux 2023:**
```bash
sudo yum update -y
sudo yum install -y gcc openssl-devel git
```

**For Ubuntu 22.04:**
```bash
sudo apt update
sudo apt install -y build-essential libssl-dev pkg-config git
```

### 3.5 Install Rust (if building on server)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 3.6 Deploy Application

**Option A: Copy pre-built binary**

```bash
# From local machine
scp -i your-key.pem target/release/star-office-server ec2-user@EC2_PUBLIC_IP:~/

# On EC2
chmod +x ~/star-office-server
```

**Option B: Build on server**

```bash
git clone https://github.com/your-repo/rayclaw-small-town.git
cd rayclaw-small-town
cargo build --release
```

### 3.7 Create Config File

```bash
mkdir -p ~/clawtown
cd ~/clawtown

cat > config.toml << 'EOF'
[server]
host = "0.0.0.0"
port = 3800
static_dir = "static"

[presence]
auto_idle_ttl_secs = 300
auto_offline_ttl_secs = 300
scan_interval_secs = 30

[storage]
db_path = "clawtown.db"

[security]
admin_token = "YOUR_SECURE_ADMIN_TOKEN"
rate_limit_per_minute = 6000

[oauth]
github_client_id = "YOUR_GITHUB_CLIENT_ID"
github_client_secret = "YOUR_GITHUB_CLIENT_SECRET"
max_rooms_per_user = 1
max_bots_per_user = 5
EOF
```

### 3.8 Create Systemd Service

```bash
sudo cat > /etc/systemd/system/clawtown.service << 'EOF'
[Unit]
Description=Claw's Pixel Town API Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/clawtown
ExecStart=/home/ec2-user/star-office-server
Restart=always
RestartSec=5
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable clawtown
sudo systemctl start clawtown
sudo systemctl status clawtown
```

### 3.9 View Logs

```bash
sudo journalctl -u clawtown -f
```

---

## Part 4: Nginx Reverse Proxy with SSL

### 4.1 Install Nginx

**Amazon Linux 2023:**
```bash
sudo yum install -y nginx
```

**Ubuntu:**
```bash
sudo apt install -y nginx
```

### 4.2 Install Certbot (Let's Encrypt)

**Amazon Linux 2023:**
```bash
sudo yum install -y certbot python3-certbot-nginx
```

**Ubuntu:**
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 4.3 Configure Nginx

```bash
sudo cat > /etc/nginx/conf.d/clawtown.conf << 'EOF'
server {
    listen 80;
    server_name api.clawtown.dev;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.clawtown.dev;

    # SSL will be configured by certbot
    # ssl_certificate /etc/letsencrypt/live/api.clawtown.dev/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.clawtown.dev/privkey.pem;

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:3800;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # API endpoints
    location / {
        proxy_pass http://127.0.0.1:3800;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

### 4.4 Get SSL Certificate

```bash
sudo certbot --nginx -d api.clawtown.dev
```

### 4.5 Start Nginx

```bash
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl status nginx
```

### 4.6 Auto-renew SSL

Certbot automatically adds a cron job. Verify:
```bash
sudo certbot renew --dry-run
```

---

## Part 5: Cloudflare SSL Configuration

### 5.1 SSL/TLS Settings

1. Go to Cloudflare Dashboard > SSL/TLS
2. Set encryption mode to **Full (strict)**
3. Enable **Always Use HTTPS**

### 5.2 Origin Server Certificate (Alternative)

If using Cloudflare proxy for api.clawtown.dev:

1. Go to SSL/TLS > Origin Server
2. Create Certificate
3. Copy certificate and key to EC2
4. Update Nginx config to use Cloudflare origin cert

---

## Part 6: GitHub OAuth Setup

### 6.1 Create GitHub OAuth App

1. Go to GitHub > Settings > Developer settings > OAuth Apps
2. New OAuth App:
   - **Application name**: Claw's Pixel Town
   - **Homepage URL**: https://clawtown.dev
   - **Authorization callback URL**: https://api.clawtown.dev/auth/github/callback

3. Copy Client ID and Client Secret

### 6.2 Update Config

Update `config.toml` on EC2:
```toml
[oauth]
github_client_id = "your_client_id"
github_client_secret = "your_client_secret"
```

Restart service:
```bash
sudo systemctl restart clawtown
```

---

## Part 7: CORS Configuration

Update the Rust server to allow CORS from your domain.

In `crates/star-office-server/src/main.rs`, ensure CORS is configured:

```rust
let cors = CorsLayer::new()
    .allow_origin([
        "https://clawtown.dev".parse().unwrap(),
        "https://www.clawtown.dev".parse().unwrap(),
    ])
    .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
    .allow_headers(Any)
    .allow_credentials(true);
```

---

## Part 8: Deployment Checklist

### Pre-deployment
- [ ] Update API_BASE URL in frontend code
- [ ] Update WebSocket URL in frontend code
- [ ] Build frontend with `pnpm build`
- [ ] Build backend with `cargo build --release`

### Cloudflare
- [ ] Domain added to Cloudflare
- [ ] DNS records configured
- [ ] Cloudflare Pages deployed
- [ ] SSL set to Full (strict)

### EC2
- [ ] Instance launched and running
- [ ] Security group configured
- [ ] Binary deployed
- [ ] Config file created with secrets
- [ ] Systemd service enabled
- [ ] Nginx configured
- [ ] SSL certificate obtained

### GitHub OAuth
- [ ] OAuth app created
- [ ] Callback URL set correctly
- [ ] Credentials in config.toml

### Testing
- [ ] https://clawtown.dev loads
- [ ] https://api.clawtown.dev/health returns OK
- [ ] GitHub login works
- [ ] WebSocket connection works
- [ ] Room creation works

---

## Part 9: Maintenance

### Update Frontend

```bash
# Local
cd webview-ui
pnpm build

# Deploy via Cloudflare Pages (auto on git push)
# Or manual: wrangler pages deploy dist
```

### Update Backend

```bash
# Local
cargo build --release

# Copy to EC2
scp -i your-key.pem target/release/star-office-server ec2-user@EC2_PUBLIC_IP:~/

# On EC2
sudo systemctl stop clawtown
cp ~/star-office-server ~/clawtown/
sudo systemctl start clawtown
```

### Backup Database

```bash
# On EC2
cp ~/clawtown/clawtown.db ~/backups/clawtown-$(date +%Y%m%d).db
```

### View Logs

```bash
# API logs
sudo journalctl -u clawtown -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Quick Reference

| Service | URL |
|---------|-----|
| Frontend | https://clawtown.dev |
| API | https://api.clawtown.dev |
| WebSocket | wss://api.clawtown.dev/ws |
| Health Check | https://api.clawtown.dev/health |

| EC2 Commands | Description |
|--------------|-------------|
| `sudo systemctl status clawtown` | Check API status |
| `sudo systemctl restart clawtown` | Restart API |
| `sudo journalctl -u clawtown -f` | View API logs |
| `sudo systemctl status nginx` | Check Nginx status |
