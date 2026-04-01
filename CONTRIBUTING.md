# Contributing to osTicket MCP Server

## Development Setup

```bash
git clone https://github.com/markus-michalski/claude-mcp-osTicket.git
cd claude-mcp-osTicket
npm install

# Configure environment
cp .env.example .env
# Edit .env with your osTicket API credentials

# Build TypeScript
npm run build
```

## Code Style

- **Language:** TypeScript (strict mode)
- **Indentation:** 2 spaces
- **Linting:** ESLint (`npm run lint`)
- **Type checking:** `npm run type-check`
- **Comments:** English

## Architecture

```
src/
  index.ts                    # Entry point, MCP server setup
  infrastructure/
    http/                     # HTTP client for osTicket API
  tools/                      # MCP tool implementations
```

### Adding a New MCP Tool

1. Create the tool handler in `src/tools/`
2. Register it in `src/index.ts`
3. Add Zod validation schema for inputs
4. Use proper tool annotations (`readOnlyHint`, `destructiveHint`, etc.)

## Development Commands

```bash
npm run build       # Compile TypeScript
npm run dev         # Run with tsx (hot reload)
npm run lint        # ESLint
npm run type-check  # TypeScript check without emit
npm run watch       # Compile in watch mode
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new MCP tool
fix: correct a bug
docs: update documentation
refactor: restructure code
```

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run build` and `npm run lint` pass
4. Open a PR with a clear description
