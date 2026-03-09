"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent, Alert, CostData, AgentStatus, AlertSeverity } from "@/lib/types";
import { getAgents, getAlerts, getCosts, pauseAgent, resumeAgent, acknowledgeAlert } from "@/lib/api";
import { ClaWatchLogo, ClaWatchIcon } from "@/components/clawatch-logo";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const statusConfig: Record<AgentStatus, { color: string; dot: string; label: string }> = {
  running: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Running" },
  paused: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Paused" },
  stopped: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Stopped" },
  error: { color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400", label: "Error" },
  stuck: { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400 animate-pulse", label: "Stuck" },
};

const severityConfig: Record<AlertSeverity, { color: string; icon: string }> = {
  critical: { color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "!" },
  warning: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: "!" },
  info: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "i" },
};

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [a, al, c] = await Promise.all([getAgents(), getAlerts(), getCosts()]);
      setAgents(a);
      setAlerts(al);
      setCosts(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const unackedAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unackedAlerts.filter((a) => a.severity === "critical" || a.severity === "warning");
  const runningCount = agents.filter((a) => a.status === "running").length;
  const totalCost = costs?.totalUsd ?? 0;

  async function handlePauseResume(agent: Agent) {
    if (agent.status === "running") {
      await pauseAgent(agent.id);
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, status: "paused" as AgentStatus } : a)));
    } else if (agent.status === "paused") {
      await resumeAgent(agent.id);
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, status: "running" as AgentStatus } : a)));
    }
  }

  async function handleAcknowledge(alertId: string) {
    await acknowledgeAlert(alertId);
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <ClaWatchIcon />
              <ClaWatchLogo size="md" />
            </Link>
            <span className="text-sm text-muted-foreground">Dashboard</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Alert Banner */}
        {criticalAlerts.length > 0 && (
          <div className="space-y-2">
            {criticalAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                  alert.severity === "critical"
                    ? "border-red-500/30 bg-red-500/5 text-red-400"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold uppercase">
                    {alert.severity}
                  </span>
                  <span>{alert.message}</span>
                  <span className="text-xs opacity-60">{formatRelativeTime(alert.timestamp)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleAcknowledge(alert.id)}
                  className="text-current hover:bg-white/10"
                >
                  Acknowledge
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{agents.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Running</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-400">{runningCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${totalCost.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${unackedAlerts.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {unackedAlerts.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Agents</h2>
          <div className="grid gap-3">
            {agents.map((agent) => {
              const sc = statusConfig[agent.status];
              return (
                <div
                  key={agent.id}
                  className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4 hover:border-border transition-colors"
                >
                  {/* Status dot + name */}
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <span className={`size-2.5 rounded-full ${sc.dot}`} />
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.host}</div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <Badge variant="outline" className={`${sc.color} border text-xs`}>
                    {sc.label}
                  </Badge>

                  {/* Stats */}
                  <div className="flex items-center gap-6 ml-auto text-sm text-muted-foreground">
                    <div className="text-right min-w-[80px]">
                      <div className="text-foreground font-medium">${agent.costUsd.toFixed(2)}</div>
                      <div className="text-xs">cost</div>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="text-foreground font-medium">{formatTokens(agent.tokenCount)}</div>
                      <div className="text-xs">tokens</div>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <div className={`font-medium ${agent.errorCount > 0 ? "text-red-400" : "text-foreground"}`}>
                        {agent.errorCount}
                      </div>
                      <div className="text-xs">errors</div>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="text-foreground font-medium">{formatRelativeTime(agent.lastHeartbeat)}</div>
                      <div className="text-xs">heartbeat</div>
                    </div>

                    {/* Pause/Resume */}
                    <div className="min-w-[90px]">
                      {(agent.status === "running" || agent.status === "paused") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePauseResume(agent)}
                          className="w-full text-xs"
                        >
                          {agent.status === "running" ? "Pause" : "Resume"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost Overview */}
        {costs && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Cost by Agent</h2>
              <Card>
                <CardContent className="pt-4 space-y-3">
                  {costs.byAgent
                    .sort((a, b) => b.costUsd - a.costUsd)
                    .map((item) => (
                      <div key={item.agentId} className="flex items-center justify-between">
                        <span className="text-sm">{item.name}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${(item.costUsd / costs.totalUsd) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">
                            ${item.costUsd.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-4">Cost by Model</h2>
              <Card>
                <CardContent className="pt-4 space-y-3">
                  {costs.byModel
                    .sort((a, b) => b.costUsd - a.costUsd)
                    .map((item) => (
                      <div key={item.model} className="flex items-center justify-between">
                        <span className="text-sm font-mono">{item.model}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${(item.costUsd / costs.totalUsd) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">
                            ${item.costUsd.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* All Alerts */}
        <div>
          <h2 className="text-lg font-semibold mb-4">All Alerts</h2>
          <Card>
            <CardContent className="pt-4 space-y-2">
              {alerts.map((alert) => {
                const sc = severityConfig[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
                      alert.acknowledged ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`${sc.color} border text-[10px] uppercase font-bold`}>
                        {alert.severity}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {alert.type.replace("_", " ")}
                      </Badge>
                      <span>{alert.message}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(alert.timestamp)}
                      </span>
                      {!alert.acknowledged && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleAcknowledge(alert.id)}
                        >
                          Ack
                        </Button>
                      )}
                      {alert.acknowledged && (
                        <span className="text-xs text-muted-foreground">Acked</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
