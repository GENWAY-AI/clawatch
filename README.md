<div align="center">
  <img src="frontend/public/clawatch-owl.svg" alt="ClaWatch" width="160" height="160" />
  
  # ClaWatch
  
  ### **The Mission Control for AI Agents**
  
  *Real-time observability, cost tracking, and smart alerts for your autonomous AI workforce*
  
  [![npm version](https://img.shields.io/npm/v/clawatch.svg?style=flat&color=00C853)](https://www.npmjs.com/package/clawatch)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)
  [![Deploy on Railway](https://img.shields.io/badge/Deploy%20on-Railway-blueviolet?style=flat&logo=railway)](https://railway.app/template/clawatch)
  
  [**🚀 Live Demo**](https://clawatch.dev) · [**📖 Docs**](https://clawatch.dev/docs) · [**💬 Discord**](https://discord.gg/clawatch)
  
  <img src="https://clawatch.dev/demo.gif" alt="ClaWatch Dashboard Demo" width="800" />
</div>

---

## 🎯 Why ClaWatch?

AI agents are powerful — until they're not. They loop infinitely, burn through API credits, get stuck on edge cases, or silently fail. You need **visibility**.

ClaWatch is **Datadog for AI agents**. It watches your autonomous systems 24/7, tracks every token and dollar spent, and alerts you the moment something goes wrong — before it costs you thousands.

### Built for Teams Shipping AI

- 🏢 **Engineering teams** building multi-agent systems
- 🤖 **AI product companies** running fleets of agents in production
- 🔬 **Researchers** tracking experiment costs across models
- 🚀 **Indie hackers** keeping agent costs under control

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔍 **Real-Time Agent Monitoring**
Track every heartbeat, session, and tool call from your agents. See what they're doing, right now.

</td>
<td width="50%">

### 💸 **Cost Intelligence**
Per-agent, per-model cost breakdown. Set budgets, get alerts before you blow through your OpenAI credits.

</td>
</tr>
<tr>
<td>

### 🚨 **Smart Alerts**
Telegram/Slack notifications when agents loop, spike in cost, crash, or go silent. Actionable, not noisy.

</td>
<td>

### ⏯️ **Agent Control**
Pause runaway agents with one click. Resume when you've fixed the issue. Full remote control.

</td>
</tr>
<tr>
<td>

### 📊 **Beautiful Dashboard**
Dark-themed, responsive web UI. Filter by agent, project, model. Export CSVs. Mobile-friendly.

</td>
<td>

### 🔓 **100% Open Source**
MIT licensed. Self-host on Railway/Render/your VPS. No lock-in, no vendor fees. Your data stays yours.

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Install the CLI

```bash
npm install -g clawatch
```

### Start Everything

```bash
clawatch start
```

That's it. ClaWatch auto-configures on first run, starts a local dashboard at `http://localhost:3456`, and begins monitoring your OpenClaw agents.

### Configure Alerts (Optional)

```bash
# Get Telegram notifications when agents misbehave
export TELEGRAM_BOT_TOKEN="your_bot_token"
export TELEGRAM_CHAT_ID="your_chat_id"

clawatch start
```

---

## 📸 Screenshots

<details>
<summary><strong>📊 Dashboard Overview</strong></summary>

![Dashboard](https://clawatch.dev/screenshots/dashboard.png)

Real-time agent activity, cost trends, and session summaries.

</details>

<details>
<summary><strong>💰 Cost Breakdown</strong></summary>

![Costs](https://clawatch.dev/screenshots/costs.png)

Per-agent spend with model-level granularity. Export to CSV for finance reports.

</details>

<details>
<summary><strong>🚨 Alert Inspector</strong></summary>

![Alerts](https://clawatch.dev/screenshots/alerts.png)

See which agents triggered alerts, when, and why. One-click to view session logs.

</details>

<details>
<summary><strong>🤖 Agent Session Logs</strong></summary>

![Sessions](https://clawatch.dev/screenshots/sessions.png)

Full conversation history with token counts, model info, and timestamps.

</details>

---

## 🏗️ Architecture

```
┌──────────────────┐
│  Your AI Agents  │  (OpenClaw, LangChain, AutoGPT, etc.)
│  ~/.openclaw/    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  ClaWatch CLI    │─────▶│  Backend API     │─────▶│  Alert Channels  │
│  (Daemon)        │      │  Express+SQLite  │      │  Telegram/Slack  │
└──────────────────┘      └────────┬─────────┘      └──────────────────┘
                                   │
                          ┌────────▼─────────┐
                          │   Web Dashboard  │
                          │   (Next.js)      │
                          └──────────────────┘
                         http://localhost:3456
```

**How it works:**

1. **CLI daemon** watches `~/.openclaw/` for agent activity (sessions, logs, costs)
2. **Backend API** aggregates data into SQLite, exposes REST endpoints
3. **Dashboard** visualizes everything in a beautiful dark-themed UI
4. **Alert system** watches for anomalies and sends notifications

---

## 🛠️ CLI Commands

| Command | Description |
|---------|-------------|
| `clawatch start` | Start the monitoring daemon + dashboard |
| `clawatch stop` | Stop the daemon |
| `clawatch status` | Show agent count, session stats, uptime |
| `clawatch logs` | Tail daemon logs in real-time |
| `clawatch --help` | Full command reference |

---

## 🌐 Deploy to Production

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/clawatch)

Railway auto-configures everything: backend, dashboard, persistent SQLite storage. Free tier available.

### Manual Docker Deploy

```bash
git clone https://github.com/GENWAY-AI/clawatch.git
cd clawatch
docker build -t clawatch .
docker run -p 3456:3456 -e TELEGRAM_BOT_TOKEN=xxx clawatch
```

Supports **Railway, Render, Fly.io, AWS, GCP, Azure, Hetzner** — anywhere Docker runs.

---

## 🔔 Alert Channels

Configure one or more channels to get notified when agents misbehave:

| Channel | Status | Setup Guide |
|---------|--------|-------------|
| 📱 **Telegram** | ✅ Live | [Telegram Setup](https://clawatch.dev/docs/alerts/telegram) |
| 💬 **Slack** | 🔜 Soon | [Slack Setup](https://clawatch.dev/docs/alerts/slack) |
| 🎮 **Discord** | 🔜 Soon | [Discord Setup](https://clawatch.dev/docs/alerts/discord) |
| 📧 **Email** | 🔜 Soon | [Email Setup](https://clawatch.dev/docs/alerts/email) |
| 📟 **PagerDuty** | 🔜 Soon | [PagerDuty Setup](https://clawatch.dev/docs/alerts/pagerduty) |

### Alert Types

- 🔴 **Agent Crash** — Agent stopped unexpectedly
- 🔁 **Infinite Loop** — Agent stuck repeating the same action
- 💸 **Cost Spike** — Agent exceeded hourly/daily budget
- 🕐 **Agent Stalled** — No activity for >10 minutes
- ⚠️ **High Error Rate** — >20% of tool calls failing

---

## 🧑‍💻 Development

### Prerequisites

- Node.js 18+
- npm or pnpm

### Local Setup

```bash
# Clone the repo
git clone https://github.com/GENWAY-AI/clawatch.git
cd clawatch

# Backend
cd backend
npm install
npm run dev        # Runs on http://localhost:3001

# Frontend (in a new terminal)
cd frontend
npm install
npm run dev        # Runs on http://localhost:3000

# CLI (in a new terminal)
cd cli
npm install
npm run build
npm link           # Makes `clawatch` command available globally
```

### Project Structure

```
clawatch/
├── cli/              # Monitoring daemon + CLI commands
│   ├── src/
│   │   ├── cli.ts    # Main entry point
│   │   └── daemon.ts # Background monitoring process
│   └── package.json
├── backend/          # Express API server
│   ├── src/
│   │   ├── index.ts  # Server entry
│   │   ├── routes/   # REST endpoints
│   │   └── db.ts     # SQLite schema
│   └── package.json
├── frontend/         # Next.js dashboard
│   ├── app/          # App router pages
│   ├── components/   # React components
│   └── package.json
├── Dockerfile        # Production container
└── API_CONTRACT.md   # Backend API documentation
```

---

## 📈 Roadmap

### ✅ Shipped

- [x] Real-time agent monitoring
- [x] Cost tracking per agent/model
- [x] Telegram alerts
- [x] SQLite backend (no external DB required)
- [x] Railway one-click deploy
- [x] Session logs with full conversation history
- [x] Dark-themed dashboard

### 🚧 In Progress

- [ ] Slack integration
- [ ] Discord bot
- [ ] Custom alert rules builder
- [ ] Multi-user auth & teams
- [ ] Historical trend charts (7d/30d)

### 🔮 Coming Soon

- [ ] LangChain/LangGraph native integration
- [ ] AutoGPT plugin
- [ ] Agent performance scoring
- [ ] Cost prediction ML model
- [ ] Prometheus/Grafana exporter
- [ ] Mobile app (iOS/Android)

[**Vote on features →**](https://github.com/GENWAY-AI/clawatch/discussions)

---

## 🤝 Contributing

We love contributions! Whether it's bug reports, feature requests, or PRs — all are welcome.

### How to Contribute

1. **Fork the repo** and create a feature branch
2. **Make your changes** (add tests if applicable)
3. **Open a PR** with a clear description of what you built
4. **We'll review** and merge within 48 hours

### Good First Issues

Looking for a place to start? Check out issues labeled [`good first issue`](https://github.com/GENWAY-AI/clawatch/labels/good%20first%20issue).

---

## 💬 Community & Support

- **Discord**: [Join the ClaWatch community](https://discord.gg/clawatch)
- **GitHub Discussions**: [Ask questions, share tips](https://github.com/GENWAY-AI/clawatch/discussions)
- **Twitter**: [@clawatch](https://twitter.com/clawatch)
- **Email**: hello@genway.ai

---

## 🌟 Stargazers

[![Stargazers over time](https://starchart.cc/GENWAY-AI/clawatch.svg?variant=adaptive)](https://starchart.cc/GENWAY-AI/clawatch)

---

## 📜 License

MIT © [GENWAY AI](https://github.com/GENWAY-AI)

You're free to use ClaWatch in commercial products, fork it, modify it, and redistribute it. See [LICENSE](./LICENSE) for details.

---

<div align="center">
  
  ### **Built with ❤️ by [GENWAY AI](https://genway.ai)**
  
  **Making AI agents reliable, observable, and controllable.**
  
  [Website](https://clawatch.dev) · [GitHub](https://github.com/GENWAY-AI/clawatch) · [Twitter](https://twitter.com/clawatch)
  
</div>
