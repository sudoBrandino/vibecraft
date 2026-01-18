# Vibecraft on Windows (WSL2)

Vibecraft runs on Windows using WSL2 (Windows Subsystem for Linux), providing **full feature parity** with macOS and Linux.

## Prerequisites

- Windows 10 version 2004+ or Windows 11
- WSL2 with Ubuntu (or similar Linux distro)
- Node.js 18+

## Quick Setup

### 1. Enable WSL2

Open PowerShell as Administrator and run:

```powershell
wsl --install
```

Restart your computer when prompted. This installs WSL2 with Ubuntu by default.

### 2. Install Dependencies

Open Ubuntu (from Start menu) and run:

```bash
# Update package list
sudo apt update

# Install required tools
sudo apt install -y jq tmux curl

# Install Node.js 20 (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version   # Should be 18+
jq --version
tmux -V
```

### 3. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### 4. Configure Vibecraft

```bash
npx vibecraft setup
```

This installs the hook script and configures Claude Code to send events to Vibecraft.

### 5. Start Everything

You need two terminals (or use tmux panes):

**Terminal 1 - Claude Code:**
```bash
tmux new -s claude
claude
```

**Terminal 2 - Vibecraft Server:**
```bash
npx vibecraft
```

### 6. Open in Browser

Open your Windows browser and go to:

```
http://localhost:4003
```

WSL2 automatically forwards localhost ports to Windows, so your browser can connect directly.

## Tips

### Use Windows Terminal

Windows Terminal provides the best experience for WSL2:

```powershell
# Install via winget
winget install Microsoft.WindowsTerminal
```

Features:
- Multiple tabs (one for Claude, one for Vibecraft)
- Better font rendering
- GPU acceleration
- Split panes

### File Locations

For best performance, keep your projects in the WSL2 filesystem:

```bash
# Good - fast
~/projects/my-app

# Slower - crossing filesystem boundary
/mnt/c/Users/YourName/projects/my-app
```

You can still access Windows files from WSL2 via `/mnt/c/`, but performance is better with native Linux paths.

### Docker Desktop Integration

If you use Docker Desktop for Windows, it integrates with WSL2:

1. Open Docker Desktop settings
2. Enable "Use the WSL 2 based engine"
3. Under Resources > WSL Integration, enable your distro

Then you can run the Vibecraft Docker container from within WSL2.

## Troubleshooting

### Port Not Accessible from Windows

If `http://localhost:4003` doesn't work in your Windows browser:

1. **Check if server is running:**
   ```bash
   curl http://localhost:4003/health
   ```

2. **Check WSL2 networking mode:**
   ```bash
   # In WSL2
   ip addr show eth0
   ```

   If you see a `172.x.x.x` address, WSL2 is in NAT mode (normal).

3. **Try the WSL2 IP directly:**
   ```bash
   # Get WSL2 IP
   hostname -I
   ```
   Then try `http://<that-ip>:4003` in Windows browser.

4. **Firewall issues:**
   Windows Firewall may block WSL2. Try temporarily disabling it to test.

### Claude Code Not Found

```bash
# Check if Node.js is installed
node --version

# Check if npm global bin is in PATH
echo $PATH | grep -o '[^:]*npm[^:]*'

# Reinstall Claude Code
npm install -g @anthropic-ai/claude-code

# If still not found, add npm global bin to PATH
echo 'export PATH="$PATH:$(npm config get prefix)/bin"' >> ~/.bashrc
source ~/.bashrc
```

### Hooks Not Firing

1. **Restart Claude Code** after running `npx vibecraft setup`

2. **Check hook installation:**
   ```bash
   cat ~/.claude/settings.json | jq '.hooks'
   ```

3. **Run diagnostics:**
   ```bash
   npx vibecraft doctor
   ```

### WSL2 Performance Issues

If WSL2 feels slow:

1. **Increase memory allocation:**
   Create/edit `%UserProfile%\.wslconfig`:
   ```ini
   [wsl2]
   memory=8GB
   processors=4
   ```
   Then restart WSL2: `wsl --shutdown`

2. **Use native Linux filesystem** (not /mnt/c/)

3. **Disable Windows Defender real-time scanning** for WSL2 paths

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Windows Host                                                │
│                                                              │
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
│  │                      │ :4003 (auto-forwards) │├───────┘ │
│  │                      └───────────────────────┘│         │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Feature Parity

| Feature | Windows/WSL2 | macOS | Linux |
|---------|--------------|-------|-------|
| Event visualization | Yes | Yes | Yes |
| Activity feed | Yes | Yes | Yes |
| Prompt injection (tmux) | Yes | Yes | Yes |
| Multi-session | Yes | Yes | Yes |
| Voice input | Yes | Yes | Yes |
| Draw mode | Yes | Yes | Yes |
| Sound effects | Yes | Yes | Yes |

All features work identically on Windows via WSL2.
