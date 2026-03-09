# 🔍 ClaWatch

**Never let your agents run wild.**

Open-source observability & monitoring for AI agents. Think Datadog, but for agent pipelines.

Real-time visibility, alerting, cost tracking, and the ability to pause or approve agent actions before they cause damage.

## Quick Start

```bash
# Install the CLI
npm install -g clawatch

# Initialize (auto-detects your OpenClaw setup)
clawatch init

# Start monitoring
clawatch start
```

## What You Get

- **📊 Real-time Monitoring** — Track every heartbeat, token, and API call from your agents
- **🔔 Smart Alerts** — Telegram notifications when agents get stuck, loop, or spike in cost
- **💰 Cost Tracking** — Per-agent, per-model cost breakdown with budget thresholds
- **⏸️ Pause/Resume** — One-click control to stop runaway agents
- **🌐 Web Dashboard** — Beautiful dark-themed dashboard to monitor your fleet
- **🔓 Open Source** — MIT licensed, self-host or use our managed service

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  clawatch    │────▶│  Backend    │────▶│  Telegram   │
│  CLI agent   │     │  (Express)  │     │  Alerts     │
│  (daemon)    │     │  + SQLite   │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │              ┌────┴────┐
  Watches:            │Dashboard│
  ~/.openclaw/        │(Next.js)│
  agents/sessions/    └─────────┘
  logs/
```

## Project Structure

```
clawatch/
├── cli/        # Collection agent CLI (npm package)
├── backend/    # Express + SQLite API server
├── frontend/   # Next.js dashboard + landing page
└── API_CONTRACT.md
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `clawatch init` | Detect OpenClaw setup, create config |
| `clawatch start` | Start monitoring daemon |
| `clawatch stop` | Stop the daemon |
| `clawatch status` | Show agent count, session stats |
| `clawatch logs` | Tail daemon logs |

## Backend API

See [API_CONTRACT.md](./API_CONTRACT.md) for the full API specification.

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev

# CLI
cd cli && npm install && npm run build
```

## Supported Platforms

- macOS (Apple Silicon & Intel)
- Linux (x64, ARM)
- Windows (WSL)
- Raspberry Pi
- Any cloud VM (AWS, GCP, Hetzner, etc.)

## Alert Channels

- ✅ Telegram (live)
- 🔜 Slack
- 🔜 Discord
- 🔜 Email
- 🔜 PagerDuty

## License

MIT © [GENWAY AI](https://github.com/GENWAY-AI)

---

**Website:** [clawatch.dev](https://clawatch.dev)
