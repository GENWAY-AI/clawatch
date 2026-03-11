# Contributing to ClaWatch

Thanks for wanting to contribute! Here's everything you need to know.

## Quick Start

```bash
git clone https://github.com/GENWAY-AI/clawatch.git
cd clawatch
./scripts/dev.sh  # starts backend + frontend in dev mode
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). This isn't just a style preference — **our CI auto-bumps the version based on your commit message prefix**.

### Format

```
<type>: <short description>

[optional body]
```

### Types

| Prefix | Version Bump | When to use |
|--------|-------------|-------------|
| `fix:` | patch (1.0.x) | Bug fixes |
| `feat:` | minor (1.x.0) | New features |
| `perf:` | patch | Performance improvements |
| `refactor:` | patch | Code changes that don't fix bugs or add features |
| `docs:` | patch | Documentation only |
| `chore:` | patch | Build, CI, tooling changes |
| `test:` | patch | Adding or fixing tests |
| `BREAKING CHANGE` | major (x.0.0) | Breaking API/CLI changes (use sparingly!) |

### Examples

```bash
# Good ✅
git commit -m "fix: cost alerts showing wrong threshold amount"
git commit -m "feat: add -d flag for daemon mode"
git commit -m "docs: update README with Railway deploy instructions"

# Bad ❌
git commit -m "fixed stuff"
git commit -m "update"
git commit -m "WIP"
```

## Branch Naming

```
feat/short-description     # new features
fix/short-description      # bug fixes
chore/short-description    # maintenance
docs/short-description     # documentation
```

## Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Ensure the app builds: `cd backend && npm run build && cd ../frontend && npm run build`
4. Open a PR against `main`
5. Fill in the PR template
6. Wait for review

### PR Title

Use the same conventional commit format for your PR title — it becomes the merge commit message.

```
fix: resolve EADDRINUSE on dashboard startup
feat: add CSV export for cost data
```

## Project Structure

```
clawatch/
├── backend/     # Express API + SQLite (sql.js WASM)
├── frontend/    # Next.js 16 dashboard
├── cli/         # npm CLI package (clawatch start/stop/status)
└── scripts/     # Dev and build scripts
```

## Development

- **Backend:** `cd backend && npm run dev` (runs on :3001)
- **Frontend:** `cd frontend && npm run dev` (runs on :3456)
- **Both:** `./scripts/dev.sh`

## Questions?

Open an issue or start a discussion. We're happy to help!
