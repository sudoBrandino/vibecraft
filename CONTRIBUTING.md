# Contributing to Vibecraft

Thanks for your interest in contributing to Vibecraft!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vibecraft
   cd vibecraft
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start development server:
   ```bash
   npm run dev
   ```

## Development

### Project Structure

```
vibecraft/
├── server/           # Node.js WebSocket server
│   ├── index.ts      # Main server
│   └── rateLimit.ts  # Rate limiting
├── src/              # Frontend (Three.js)
│   ├── main.ts       # Entry point
│   ├── scene/        # 3D scene setup
│   ├── entities/     # Characters, animations
│   ├── events/       # Event handling
│   ├── ui/           # UI components
│   └── audio/        # Sound effects
├── hooks/            # Claude Code hook scripts
├── shared/           # Shared types and defaults
└── docs/             # Documentation
```

### Running Locally

```bash
# Start both client and server
npm run dev

# Or run separately:
npm run dev:client  # Vite on :4002
npm run dev:server  # Server on :4003
```

### Building

```bash
npm run build           # Build everything
npm run build:client    # Build frontend only
npm run build:server    # Build server only
```

### Docker

```bash
docker-compose up -d    # Start container
docker-compose logs -f  # View logs
docker-compose down     # Stop
```

## Code Style

- **TypeScript** with strict mode
- **No semicolons** (configured in editor)
- **2-space indentation**
- **Single quotes** for strings

The project uses TypeScript's built-in checking. Run `npx tsc --noEmit` to check types.

## Making Changes

### Branching

- `main` - stable releases
- `feature/*` - new features
- `fix/*` - bug fixes
- `docs/*` - documentation changes

### Commit Messages

Follow conventional commits:
- `feat: add new station type`
- `fix: resolve WebSocket reconnection issue`
- `docs: update Docker setup guide`
- `refactor: extract rate limiting to module`
- `ci: add multi-arch Docker build`

### Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Test locally (and in Docker if relevant)
4. Push and open a PR
5. Fill out the PR template
6. Wait for CI to pass
7. Request review

## Testing

Currently no automated tests (contributions welcome!). Please test manually:

1. **Server**: `curl http://localhost:4003/health`
2. **Frontend**: Open browser, check console for errors
3. **Docker**: `docker-compose up` and verify health endpoint
4. **Hooks**: Run `npx vibecraft doctor`

## Adding Features

### New Station

1. Add position to `STATION_POSITIONS` in `WorkshopScene.ts`
2. Create mesh in `createStations()`
3. Update `StationType` in `shared/types.ts`
4. Map tools in `TOOL_STATION_MAP`

### New Sound

1. Add sound definition in `SoundManager.ts`
2. Add trigger in appropriate handler (`soundHandlers.ts`)

### New Event Handler

1. Create handler in `src/events/handlers/`
2. Register in `src/events/handlers/index.ts`

## Documentation

- Update `CLAUDE.md` for technical docs
- Update `README.md` for user-facing changes
- Add to `docs/` for detailed guides

## Questions?

Open an issue with the "question" label or check existing discussions.
