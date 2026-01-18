# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Vibecraft, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email security concerns to the maintainers (see package.json for contact)
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Measures

Vibecraft implements several security measures:

### Network Security
- **CORS validation**: Only allows connections from localhost and vibecraft.sh
- **Origin header checking**: WebSocket connections require valid origin
- **Rate limiting**: Prevents abuse of HTTP endpoints
- **Connection limits**: Max 10 WebSocket connections per IP

### Input Validation
- **Request body limits**: Max 1MB to prevent memory exhaustion
- **Path traversal prevention**: Validates directory paths
- **tmux session name validation**: Only alphanumeric characters allowed
- **Shell injection prevention**: Uses `execFile` with array arguments

### Secrets Management
- **API key file support**: Load secrets from files (Docker secrets compatible)
- **No secrets in logs**: API keys are not logged

## Best Practices for Users

1. **Run behind a reverse proxy** in production (nginx, Traefik)
2. **Use HTTPS** for any non-localhost deployments
3. **Use Docker secrets** for API keys instead of environment variables
4. **Keep dependencies updated** - Dependabot is configured for automatic updates
5. **Review hook permissions** - The hook script has access to Claude Code events

## Dependency Security

- Dependabot is configured for automatic security updates
- `npm audit` runs in CI to catch vulnerabilities
- Dependency review on pull requests

## Scope

This security policy covers:
- The vibecraft server (server/index.ts)
- The hook script (hooks/vibecraft-hook.sh)
- The web frontend
- Docker configuration

It does NOT cover:
- Third-party services (Deepgram, etc.)
- Your own deployment infrastructure
- Claude Code itself
