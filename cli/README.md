# clawatch

> Observability & monitoring for AI agents. Datadog for your AI team.

**ClaWatch** tracks your [OpenClaw](https://openclaw.ai) agents in real-time — costs, tokens, sessions, errors — and alerts you when things go wrong.

## Install

```bash
npm install -g clawatch
```

## Quick Start

```bash
# Detect agents and configure
clawatch init

# Start monitoring daemon
clawatch start

# Check status
clawatch status

# View logs
clawatch logs

# Stop monitoring
clawatch stop
```

## What It Monitors

- **Costs** — Per-agent, per-session, per-model cost tracking (USD)
- **Tokens** — Input, output, cache read/write breakdown
- **Sessions** — Active sessions with human-readable titles
- **Errors** — Tool failures, stuck agents, error spikes
- **Heartbeats** — Agent liveness detection

## How It Works

ClaWatch runs a lightweight daemon that watches your `~/.openclaw` directory for new session data. It parses JSONL session files in real-time and reports metrics to the ClaWatch backend.

```
~/.openclaw/agents/*/sessions/*.jsonl → clawatch daemon → ClaWatch API → Dashboard + Alerts
```

## Configuration

Config is stored at `~/.clawatch/config.json`:

```json
{
  "backendUrl": "http://localhost:3001",
  "openclawDir": "~/.openclaw",
  "agents": ["anas", "dor", "ofek"]
}
```

## Dashboard

View your agents at [clawatch.dev](https://clawatch.dev) or run the dashboard locally.

## Alerts

Get notified via Telegram when:
- An agent gets stuck (no heartbeat for 5+ minutes)
- Error rate spikes
- Cost exceeds threshold

More channels coming: Slack, Discord, email, PagerDuty.

## License

MIT — [GENWAY AI](https://genway.ai)
