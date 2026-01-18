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

## 3. Windows Compatibility

### 3.1 Current Limitations

| Component | Issue | Solution |
|-----------|-------|----------|
| Hook script | Bash-only | Create PowerShell hook |
| tmux | Not available | Use ConPTY/Windows Terminal |
| Path handling | Backslashes | Normalize paths |
| `jq` | Not typically installed | Bundle or use Node.js |

### 3.2 Strategy Options

#### Option A: PowerShell Hook (Recommended)
```
Effort: Medium
Compatibility: Native Windows
```

Create a PowerShell equivalent of the bash hook that:
- Reads JSON from stdin
- Transforms to event format
- Writes to events.jsonl
- POSTs to server

**Pros:**
- Native Windows support
- No additional dependencies (PowerShell is built-in)
- Can bundle `jq` equivalent in PowerShell

**Cons:**
- Duplicate logic (bash + PowerShell)
- Need to maintain two scripts

#### Option B: Node.js Cross-Platform Hook
```
Effort: Medium-High
Compatibility: All platforms
```

Replace bash hook with a Node.js script that works everywhere.

**Pros:**
- Single codebase
- No platform-specific logic
- Better error handling

**Cons:**
- Slower startup (Node.js overhead)
- Requires Node.js in PATH during hook execution

#### Option C: WSL2 Support Only
```
Effort: Low
Compatibility: Windows 10/11 with WSL2
```

Document running Claude Code in WSL2, where bash hooks work natively.

**Pros:**
- No code changes needed
- Full feature parity

**Cons:**
- Requires WSL2 setup
- Not all Windows users want/can use WSL

### 3.3 Recommended Approach: Hybrid (A + C)

1. **Primary:** Create PowerShell hook for native Windows
2. **Alternative:** Document WSL2 as full-feature option

### 3.4 PowerShell Hook Implementation

**File: `hooks/vibecraft-hook.ps1`**
```powershell
#Requires -Version 5.1
<#
.SYNOPSIS
    Vibecraft Hook for Windows - Captures Claude Code events
.DESCRIPTION
    PowerShell equivalent of vibecraft-hook.sh for Windows systems
#>

param()

$ErrorActionPreference = "Stop"

# Configuration
$DataDir = Join-Path $env:USERPROFILE ".vibecraft\data"
$EventsFile = Join-Path $DataDir "events.jsonl"
$ServerUrl = if ($env:VIBECRAFT_SERVER_URL) { $env:VIBECRAFT_SERVER_URL } else { "http://localhost:4003" }
$NotifyUrl = "$ServerUrl/event"

# Ensure data directory exists
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

# Read input from stdin
$input = [Console]::In.ReadToEnd()

try {
    $data = $input | ConvertFrom-Json
} catch {
    Write-Error "Failed to parse JSON input"
    exit 1
}

# Extract common fields
$hookEventName = $data.hook_event_name
$sessionId = if ($data.session_id) { $data.session_id } else { "unknown" }
$cwd = if ($data.cwd) { $data.cwd } else { "" }

# Generate event ID and timestamp
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$eventId = "$sessionId-$timestamp-$(Get-Random)"

# Map event types
$eventTypeMap = @{
    "PreToolUse" = "pre_tool_use"
    "PostToolUse" = "post_tool_use"
    "Stop" = "stop"
    "SubagentStop" = "subagent_stop"
    "SessionStart" = "session_start"
    "SessionEnd" = "session_end"
    "UserPromptSubmit" = "user_prompt_submit"
    "Notification" = "notification"
}

$eventType = if ($eventTypeMap.ContainsKey($hookEventName)) {
    $eventTypeMap[$hookEventName]
} else {
    "unknown"
}

# Build event object based on type
$event = @{
    id = $eventId
    timestamp = $timestamp
    type = $eventType
    sessionId = $sessionId
    cwd = $cwd
}

switch ($eventType) {
    "pre_tool_use" {
        $event.tool = $data.tool_name
        $event.toolInput = $data.tool_input
        $event.toolUseId = $data.tool_use_id
    }
    "post_tool_use" {
        $event.tool = $data.tool_name
        $event.toolInput = $data.tool_input
        $event.toolResponse = $data.tool_response
        $event.toolUseId = $data.tool_use_id
        $event.success = if ($data.tool_response.success -ne $null) {
            $data.tool_response.success
        } else {
            $true
        }
    }
    "stop" {
        $event.stopHookActive = $data.stop_hook_active
    }
    "user_prompt_submit" {
        $event.prompt = $data.prompt
    }
    "notification" {
        $event.message = $data.message
        $event.notificationType = $data.notification_type
    }
}

# Convert to JSON (compact)
$eventJson = $event | ConvertTo-Json -Compress -Depth 10

# Append to events file
Add-Content -Path $EventsFile -Value $eventJson -NoNewline
Add-Content -Path $EventsFile -Value ""

# Notify server (fire and forget)
try {
    $null = Invoke-RestMethod -Uri $NotifyUrl -Method Post -Body $eventJson `
        -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue
} catch {
    # Ignore errors - don't block Claude
}

exit 0
```

### 3.5 Windows Session Management

**Challenge:** tmux doesn't exist on Windows. Need alternative for:
1. Session spawning (`tmux new-session`)
2. Prompt injection (`tmux send-keys`)

**Options:**

#### A. Windows Terminal + PowerShell
Use Windows Terminal's command-line interface with named tabs.

```powershell
# Start new session
wt -w 0 new-tab --title "claude-1" powershell -NoExit -Command "claude"

# Send keys (requires additional tooling)
# Windows doesn't have a native send-keys equivalent
```

**Limitation:** No reliable way to send keystrokes to another terminal.

#### B. Named Pipes / IPC
Create a wrapper that Claude runs in, which listens for prompt injection.

```
┌─────────────────────────────────────────┐
│  claude-wrapper.ps1                      │
│  - Starts Claude Code                   │
│  - Listens on named pipe                │
│  - Injects prompts when received        │
└─────────────────────────────────────────┘
```

#### C. Browser-Only Mode (Recommended for Windows)
For Windows users, disable tmux features and focus on:
- Event visualization (works fully)
- Activity feed (works fully)
- Stats and monitoring (works fully)

Document that prompt injection requires WSL2 or is not available on native Windows.

### 3.6 Windows Tasks Checklist

```
[ ] Create PowerShell hook (vibecraft-hook.ps1)
[ ] Update CLI setup command for Windows detection
[ ] Add Windows-specific settings.json configuration
[ ] Handle path normalization (backslashes)
[ ] Document Windows limitations (no tmux prompt injection)
[ ] Document WSL2 as full-feature alternative
[ ] Test on Windows 10 and Windows 11
[ ] Add Windows-specific health checks in doctor command
```

---

## 4. Implementation Order

### Phase 1: Security (Week 1)
1. Rate limiting
2. API key file support
3. WebSocket connection limits
4. Input validation

### Phase 2: Docker (Week 2)
1. Dockerfile
2. docker-compose.yml
3. Hook URL configuration
4. Documentation

### Phase 3: Windows (Week 3)
1. PowerShell hook
2. CLI Windows detection
3. Path normalization
4. Documentation

### Phase 4: Polish (Week 4)
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
hooks/vibecraft-hook.ps1
server/rateLimit.ts
docs/DOCKER.md
docs/WINDOWS.md
```

### Modified Files
```
server/index.ts          # Rate limiting, API key file, connection limits
hooks/vibecraft-hook.sh  # Configurable server URL
bin/cli.js               # Windows detection, docker-setup command
README.md                # Docker and Windows docs
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

### Windows
- [ ] PowerShell hook captures events
- [ ] `npx vibecraft setup` works on Windows
- [ ] Visualization works in browser
- [ ] Clear documentation of limitations
