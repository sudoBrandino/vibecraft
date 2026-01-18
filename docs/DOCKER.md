# Vibecraft Docker Setup

Run Vibecraft in a Docker container for easy deployment and isolation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Container                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  vibecraft server (Node.js)                             ││
│  │  - Port 4003 (WebSocket + HTTP)                         ││
│  │  - Serves static frontend                               ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                     Volume Mount                             │
│              ~/.vibecraft/data ←→ /data                     │
└─────────────────────────────────────────────────────────────┘
           │                              ▲
           │ WebSocket                    │ HTTP POST
           ▼                              │
     ┌───────────┐              ┌─────────────────┐
     │  Browser  │              │ vibecraft-hook  │
     └───────────┘              │ (runs on HOST)  │
                                └─────────────────┘
```

**Important:** The hook script runs on your HOST machine (where Claude Code runs), not inside the container. The container only runs the server and serves the web UI.

## Quick Start

### 1. Clone and Build

```bash
git clone https://github.com/nearcyan/vibecraft
cd vibecraft
docker-compose up -d
```

### 2. Configure Hook on Host

The hook needs to know where to send events. Set the server URL:

```bash
# Add to your shell profile (~/.bashrc or ~/.zshrc)
export VIBECRAFT_SERVER_URL="http://localhost:4003"
```

Then run the normal setup:

```bash
npx vibecraft setup
```

### 3. Open Browser

```
http://localhost:4003
```

## Docker Compose

The included `docker-compose.yml` provides:

- Automatic restart on failure
- Volume persistence for data
- Docker secrets for API keys
- Resource limits
- Log rotation

### Basic Usage

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

### Configuration

Environment variables in docker-compose.yml:

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBECRAFT_PORT` | 4003 | Server port |
| `VIBECRAFT_DEBUG` | false | Enable debug logging |
| `DEEPGRAM_API_KEY_FILE` | /run/secrets/deepgram_key | Path to Deepgram API key file |

### Using Docker Secrets

For secure API key handling:

1. Create secrets directory:
   ```bash
   mkdir -p secrets
   ```

2. Add your Deepgram API key:
   ```bash
   echo "your-api-key-here" > secrets/deepgram.txt
   chmod 600 secrets/deepgram.txt
   ```

3. The docker-compose.yml already mounts this as a secret.

### Shared Data Directory

To share data between host hook and container:

```yaml
# In docker-compose.yml, change volumes:
volumes:
  - ~/.vibecraft/data:/data
```

This allows the hook (on host) and server (in container) to access the same files.

## Manual Docker Usage

### Build Image

```bash
docker build -t vibecraft:latest .
```

### Run Container

```bash
docker run -d \
  --name vibecraft \
  -p 4003:4003 \
  -v vibecraft-data:/data \
  -e VIBECRAFT_DEBUG=false \
  vibecraft:latest
```

### With Deepgram API Key

```bash
docker run -d \
  --name vibecraft \
  -p 4003:4003 \
  -v vibecraft-data:/data \
  -e DEEPGRAM_API_KEY=your-key-here \
  vibecraft:latest
```

Or with a key file:

```bash
docker run -d \
  --name vibecraft \
  -p 4003:4003 \
  -v vibecraft-data:/data \
  -v /path/to/key.txt:/run/secrets/deepgram_key:ro \
  -e DEEPGRAM_API_KEY_FILE=/run/secrets/deepgram_key \
  vibecraft:latest
```

## Production Deployment

### With Nginx Reverse Proxy

```nginx
upstream vibecraft {
    server 127.0.0.1:4003;
}

server {
    listen 443 ssl http2;
    server_name vibecraft.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://vibecraft;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### With Traefik

```yaml
# docker-compose.yml with Traefik labels
services:
  vibecraft:
    # ... other config ...
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.vibecraft.rule=Host(`vibecraft.example.com`)"
      - "traefik.http.routers.vibecraft.tls=true"
      - "traefik.http.services.vibecraft.loadbalancer.server.port=4003"
```

## Health Checks

The container includes a health check that pings `/health` every 30 seconds.

Check container health:

```bash
docker inspect --format='{{.State.Health.Status}}' vibecraft
```

Manual health check:

```bash
curl http://localhost:4003/health
```

Response:
```json
{
  "ok": true,
  "version": "0.1.15",
  "clients": 2,
  "events": 150,
  "voiceEnabled": true,
  "rateLimitEntries": 5
}
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs vibecraft

# Check if port is in use
lsof -i :4003
```

### Events Not Appearing

1. **Check hook configuration:**
   ```bash
   echo $VIBECRAFT_SERVER_URL
   # Should be http://localhost:4003
   ```

2. **Test hook connectivity:**
   ```bash
   curl -X POST http://localhost:4003/event \
     -H "Content-Type: application/json" \
     -d '{"type":"test","id":"test-1","timestamp":1234567890}'
   ```

3. **Check container can receive requests:**
   ```bash
   docker-compose exec vibecraft wget -q -O- http://localhost:4003/health
   ```

### Data Not Persisting

Check volume is mounted correctly:

```bash
docker inspect vibecraft | jq '.[0].Mounts'
```

### Permission Issues

The container runs as non-root user (UID 1001). If using host volume mounts:

```bash
# Fix permissions on host
sudo chown -R 1001:1001 ~/.vibecraft/data
```

## Multi-Architecture Builds

Build for multiple platforms:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t vibecraft:latest .
```

## Resource Limits

Default limits in docker-compose.yml:
- CPU: 1 core
- Memory: 512MB

Adjust in `deploy.resources` section as needed.
