# ClaWatch MVP — API Contract (4-Hour Sprint)

Base URL: `TBD` (will share once deployed)

## Authentication
- MVP: API key in header `X-ClaWatch-Key`
- Telegram bot token stored server-side

## Endpoints

### Agents

#### GET /api/agents
List all monitored agents.
```json
{
  "agents": [
    {
      "id": "agent_abc123",
      "name": "my-assistant",
      "host": "macbook-pro",
      "status": "running" | "paused" | "stopped" | "error" | "stuck",
      "lastHeartbeat": "2026-03-09T14:00:00Z",
      "createdAt": "2026-03-09T12:00:00Z",
      "costUsd": 1.23,
      "tokenCount": 45000,
      "errorCount": 2
    }
  ]
}
```

#### GET /api/agents/:id
Single agent detail.
```json
{
  "id": "agent_abc123",
  "name": "my-assistant",
  "host": "macbook-pro",
  "status": "running",
  "lastHeartbeat": "2026-03-09T14:00:00Z",
  "createdAt": "2026-03-09T12:00:00Z",
  "costUsd": 1.23,
  "tokenCount": 45000,
  "errorCount": 2,
  "recentEvents": [
    {
      "type": "tool_call" | "error" | "heartbeat" | "cost" | "status_change",
      "timestamp": "2026-03-09T14:00:00Z",
      "data": {}
    }
  ]
}
```

#### POST /api/agents/:id/pause
Pause an agent. Returns updated agent.

#### POST /api/agents/:id/resume
Resume a paused agent. Returns updated agent.

### Events (Collection Endpoint)

#### POST /api/events
Agents POST events here. This is the collection endpoint.
```json
{
  "agentId": "agent_abc123",
  "agentName": "my-assistant",
  "host": "macbook-pro",
  "type": "heartbeat" | "tool_call" | "error" | "cost" | "status_change",
  "timestamp": "2026-03-09T14:00:00Z",
  "data": {
    "message": "optional description",
    "tokenCount": 1500,
    "costUsd": 0.03,
    "model": "claude-sonnet-4-20250514",
    "toolName": "exec",
    "error": "optional error message"
  }
}
```

### Costs

#### GET /api/costs?agentId=xxx&from=ISO&to=ISO
Cost breakdown.
```json
{
  "totalUsd": 12.50,
  "byAgent": [
    { "agentId": "agent_abc123", "name": "my-assistant", "costUsd": 8.00, "tokenCount": 250000 }
  ],
  "byModel": [
    { "model": "claude-sonnet-4-20250514", "costUsd": 8.00, "tokenCount": 250000 }
  ]
}
```

### Alerts

#### GET /api/alerts
Recent alerts (shown in dashboard).
```json
{
  "alerts": [
    {
      "id": "alert_1",
      "agentId": "agent_abc123",
      "type": "stuck" | "error" | "cost_spike" | "loop_detected",
      "severity": "critical" | "warning" | "info",
      "message": "Agent stuck — no heartbeat for 5 minutes",
      "timestamp": "2026-03-09T14:00:00Z",
      "acknowledged": false
    }
  ]
}
```

#### POST /api/alerts/:id/acknowledge
Mark alert as acknowledged.

## WebSocket (polling for MVP)
- MVP: Frontend polls GET /api/agents every 5 seconds
- V2: WebSocket at /ws for real-time updates

## Telegram Notifications
Triggered server-side when:
- Agent stuck (no heartbeat > 5 min)
- Error rate spike (>3 errors in 1 min)
- Cost threshold exceeded
- Agent status change (running → error)

Format: actionable message with inline buttons linking to dashboard.
