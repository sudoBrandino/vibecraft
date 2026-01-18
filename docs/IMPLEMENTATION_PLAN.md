# Vibecraft Implementation Plan

## Overview

This document outlines the implementation plan for three focus areas:
1. **Security Hardening** - Address identified security concerns
2. **Docker Containerization** - Package vibecraft for easy deployment
3. **Windows Compatibility** - Enable Windows users to connect to Claude Code

---

## 1. Security Hardening

### 1.1 Critical Issues

| Issue | Risk | Solution |
|-------|------|----------|
| Deepgram API key in plaintext env | Medium | Add encryption-at-rest option, document secure practices |
| No request rate limiting | Medium | Implement per-IP rate limiting |
| Event log can grow unbounded | Low | Already handled (MAX_EVENTS), but add disk space check |

### 1.2 Recommended Improvements

#### A. API Key Security
```
Priority: HIGH
Effort: Medium
```

**Tasks:**
- [ ] Add `DEEPGRAM_API_KEY_FILE` env var to read key from file (Docker secrets compatible)
- [ ] Document secure key handling in README
- [ ] Add warning if API key appears in logs
- [ ] Consider adding key rotation support

**Implementation:**
```typescript
// server/index.ts
function getDeepgramApiKey(): string | undefined {
  // Priority: file > env var
  const keyFile = process.env.DEEPGRAM_API_KEY_FILE
  if (keyFile && existsSync(keyFile)) {
    return readFileSync(keyFile, 'utf-8').trim()
  }
  return process.env.DEEPGRAM_API_KEY
}
```

#### B. Rate Limiting
```
Priority: HIGH
Effort: Low
```

**Tasks:**
- [ ] Add in-memory rate limiter for HTTP endpoints
- [ ] Limit: 100 requests/minute per IP for `/event`
- [ ] Limit: 10 requests/minute per IP for `/prompt`
- [ ] Return 429 Too Many Requests when exceeded
- [ ] Whitelist localhost by default

**Implementation:**
```typescript
// server/rateLimit.ts
interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimits = new Map<string, RateLimitEntry>()

export function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimits.get(ip)

  if (!entry || entry.resetAt < now) {
    rateLimits.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}
```

#### C. Input Validation Hardening
```
Priority: MEDIUM
Effort: Low
```

**Tasks:**
- [ ] Add JSON schema validation for incoming events
- [ ] Sanitize file paths in event payloads before logging
- [ ] Add max length checks for string fields (prompt, file paths)
- [ ] Validate event types against whitelist

#### D. WebSocket Security
```
Priority: MEDIUM
Effort: Low
```

**Tasks:**
- [ ] Add configurable allowed origins list
- [ ] Add connection limit per IP (default: 5)
- [ ] Add idle timeout for inactive connections
- [ ] Log connection attempts from blocked origins

#### E. Secrets Scanning
```
Priority: LOW
Effort: Low
```

**Tasks:**
- [ ] Add pre-commit hook to scan for secrets
- [ ] Add `.secrets.baseline` for detect-secrets
- [ ] Document in CONTRIBUTING.md

### 1.3 Security Checklist

```
[x] CSRF protection (origin validation)
[x] Path traversal prevention
[x] Shell injection prevention (execFile with arrays)
[x] Request body size limits
[ ] Rate limiting
[ ] API key file support
[ ] Input validation schemas
[ ] WebSocket connection limits
[ ] Secrets scanning
```

---

## 2. Docker Containerization

### 2.1 Architecture

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
     └───────────┘              │ (on host)       │
                                └─────────────────┘
```

**Key insight:** The hook script runs on the HOST (where Claude Code runs), not in the container. The container only runs the server and serves the UI.

### 2.2 Implementation

#### A. Dockerfile
```
Priority: HIGH
Effort: Medium
```

**File: `Dockerfile`**
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build client and server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/hooks ./hooks

# Create non-root user
RUN addgroup -g 1001 vibecraft && \
    adduser -u 1001 -G vibecraft -s /bin/sh -D vibecraft

# Create data directory
RUN mkdir -p /data && chown vibecraft:vibecraft /data

USER vibecraft

# Environment
ENV NODE_ENV=production
ENV VIBECRAFT_PORT=4003
ENV VIBECRAFT_EVENTS_FILE=/data/events.jsonl
ENV VIBECRAFT_SESSIONS_FILE=/data/sessions.json

EXPOSE 4003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost:4003/health || exit 1

CMD ["node", "dist/server/server/index.js"]
```

#### B. Docker Compose
```
Priority: HIGH
Effort: Low
```

**File: `docker-compose.yml`**
```yaml
version: '3.8'

services:
  vibecraft:
    build: .
    image: vibecraft:latest
    container_name: vibecraft
    ports:
      - "4003:4003"
    volumes:
      - vibecraft-data:/data
      # For development, mount host data dir:
      # - ~/.vibecraft/data:/data
    environment:
      - VIBECRAFT_PORT=4003
      - DEEPGRAM_API_KEY_FILE=/run/secrets/deepgram_key
    secrets:
      - deepgram_key
    restart: unless-stopped

secrets:
  deepgram_key:
    file: ./secrets/deepgram.txt

volumes:
  vibecraft-data:
```

#### C. Hook Configuration for Docker
```
Priority: HIGH
Effort: Low
```

**Tasks:**
- [ ] Update hook to use configurable server URL
- [ ] Add `VIBECRAFT_SERVER_URL` env var (default: `http://localhost:4003`)
- [ ] Document Docker setup in README
- [ ] Add `docker-setup` CLI command

**Hook update:**
```bash
# In vibecraft-hook.sh
WS_NOTIFY_URL="${VIBECRAFT_SERVER_URL:-http://localhost:4003}/event"
```

#### D. Multi-platform Build
```
Priority: MEDIUM
Effort: Low
```

**Tasks:**
- [ ] Add GitHub Actions workflow for multi-arch builds
- [ ] Build for `linux/amd64` and `linux/arm64`
- [ ] Push to Docker Hub / GitHub Container Registry

### 2.3 Docker Tasks Checklist

```
[ ] Create Dockerfile (multi-stage build)
[ ] Create docker-compose.yml
[ ] Add .dockerignore
[ ] Update hook for configurable server URL
[ ] Add Docker setup documentation
[ ] Create docker-setup CLI command
[ ] Add GitHub Actions for image builds
[ ] Test on amd64 and arm64
```

---

## 3. Windows Compatibility (via WSL2)

### 3.1 Strategy: WSL2

WSL2 provides the simplest path to Windows support with **full feature parity**.

**Why WSL2:**
- Bash hook works natively (no PowerShell port needed)
- tmux works (prompt injection supported)
- `jq` and `curl` install via `apt`
- Localhost ports auto-forward to Windows browser
- Single codebase to maintain

**Requirements:**
- Windows 10 version 2004+ or Windows 11
- WSL2 with Ubuntu (or similar distro)

### 3.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Windows Host                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Windows Browser                                        │ │
│  │  http://localhost:4003  ←──────────────────────┐       │ │
│  └────────────────────────────────────────────────│───────┘ │
│                                                    │         │
│  ┌────────────────────────────────────────────────│───────┐ │
│  │  WSL2 (Ubuntu)                                 │       │ │
│  │                                                │       │ │
│  │  ┌──────────────┐    ┌──────────────────────┐ │       │ │
│  │  │ Claude Code  │───→│ vibecraft-hook.sh    │ │       │ │
│  │  │ (in tmux)    │    │ writes events.jsonl  │ │       │ │
│  │  └──────────────┘    └──────────┬───────────┘ │       │ │
│  │                                  │             │       │ │
│  │                      ┌───────────▼───────────┐│       │ │
│  │                      │ vibecraft server      ││       │ │
│  │                      │ :4003 (auto-forwards) │├───────┘ │ │
│  │                      └───────────────────────┘│         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Setup Instructions

**File: `docs/WINDOWS.md`**

```markdown
# Vibecraft on Windows (WSL2)

## Prerequisites

1. **Enable WSL2** (if not already):
   ```powershell
   # Run in PowerShell as Administrator
   wsl --install
   ```
   Restart your computer when prompted.

2. **Install Ubuntu** (default with wsl --install, or from Microsoft Store)

## Installation

Open Ubuntu (WSL2) terminal and run:

```bash
# 1. Install dependencies
sudo apt update
sudo apt install -y jq tmux curl nodejs npm

# 2. Install Claude Code (if not already)
npm install -g @anthropic-ai/claude-code

# 3. Configure vibecraft hooks
npx vibecraft setup

# 4. Start tmux session for Claude
tmux new -s claude

# 5. Run Claude Code
claude

# 6. In another terminal (or tmux pane), start vibecraft
npx vibecraft
```

## Access from Windows Browser

Open your Windows browser and go to:
```
http://localhost:4003
```

WSL2 automatically forwards localhost ports to Windows.

## Tips

### File Access
- Access Windows files from WSL2: `/mnt/c/Users/YourName/...`
- For best performance, keep projects in WSL2 filesystem: `~/projects/`

### Multiple Terminals
Use Windows Terminal for easy WSL2 tab management:
```powershell
# Install from Microsoft Store or:
winget install Microsoft.WindowsTerminal
```

### Troubleshooting

**Port not accessible from Windows?**
```bash
# Check if server is running
curl http://localhost:4003/health

# If WSL2 networking is in NAT mode, ports should forward automatically
# If not, check: https://learn.microsoft.com/en-us/windows/wsl/networking
```

**Claude Code not found?**
```bash
# Ensure Node.js is installed in WSL2
node --version  # Should be 18+

# Reinstall Claude Code
npm install -g @anthropic-ai/claude-code
```
```

### 3.4 Implementation Tasks

```
[ ] Create docs/WINDOWS.md with WSL2 setup guide
[ ] Add WSL2 detection to `vibecraft doctor` command
[ ] Update README.md with Windows/WSL2 section
[ ] Test full workflow on Windows 10 and 11
[ ] Add troubleshooting section for common WSL2 issues
```

### 3.5 Known Limitations

| Feature | Status | Notes |
|---------|--------|-------|
| Event visualization | ✅ Works | Full support |
| Activity feed | ✅ Works | Full support |
| Prompt injection | ✅ Works | Via tmux in WSL2 |
| Multi-session | ✅ Works | Full support |
| Voice input | ✅ Works | Browser handles mic |
| File paths | ⚠️ Note | Use WSL2 paths, not /mnt/c/ for best perf |

---

## 4. Implementation Order

### Phase 1: Security
1. Rate limiting
2. API key file support
3. WebSocket connection limits
4. Input validation

### Phase 2: Docker
1. Dockerfile
2. docker-compose.yml
3. Hook URL configuration
4. Documentation

### Phase 3: Windows/WSL2
1. Create docs/WINDOWS.md
2. Add WSL2 detection to doctor command
3. Update README
4. Test on Windows 10/11

### Phase 4: Polish
1. Multi-arch Docker builds
2. GitHub Actions CI/CD
3. Comprehensive testing
4. Release

---

## 5. File Changes Summary

### New Files
```
Dockerfile
docker-compose.yml
.dockerignore
server/rateLimit.ts
docs/DOCKER.md
docs/WINDOWS.md
```

### Modified Files
```
server/index.ts          # Rate limiting, API key file, connection limits
hooks/vibecraft-hook.sh  # Configurable server URL
bin/cli.js               # WSL2 detection, docker-setup command
README.md                # Docker and Windows/WSL2 docs
package.json             # Docker scripts
```

---

## 6. Success Criteria

### Security
- [ ] Rate limiting blocks excessive requests
- [ ] API keys can be loaded from files
- [ ] No security warnings from `npm audit`

### Docker
- [ ] `docker-compose up` starts working server
- [ ] Events from host hook appear in container
- [ ] Data persists across container restarts

### Windows (WSL2)
- [ ] WSL2 setup guide is clear and complete
- [ ] `vibecraft doctor` detects WSL2 environment
- [ ] Full workflow works (hooks, tmux, browser)
- [ ] Tested on Windows 10 and Windows 11
