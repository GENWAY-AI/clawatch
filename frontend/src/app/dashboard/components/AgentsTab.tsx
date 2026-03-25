"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent, Alert, AlertDetails, CostData, AgentStatus, AlertSeverity, SpendData } from "@/lib/types";

// --- Config ---
const statusConfig: Record<AgentStatus, { color: string; dot: string; label: string; tooltip: string }> = {
  running: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Running", tooltip: "Agent is actively processing tasks." },
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Active", tooltip: "Agent is online and responsive." },
  idle: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Idle", tooltip: "Agent has no active sessions." },
  paused: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Paused", tooltip: "Agent was manually paused." },
  stopped: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Stopped", tooltip: "Agent process is not running." },
  error: { color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400", label: "Error", tooltip: "Agent encountered an error." },
  stuck: { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400 animate-pulse", label: "Stuck", tooltip: "Agent appears stuck." },
};

const severityConfig: Record<AlertSeverity, { color: string; icon: string }> = {
  critical: { color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "!" },
  warning: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: "!" },
  info: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "i" },
};

// --- Helpers ---
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

interface AggregatedAlert {
  alert: Alert;
  count: number;
  ids: string[];
}

function aggregateAlerts(alerts: Alert[]): AggregatedAlert[] {
  const groups = new Map<string, AggregatedAlert>();
  for (const alert of alerts) {
    const key = `${alert.type}::${alert.agentId}::${alert.severity}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.ids.push(alert.id);
      if (new Date(alert.timestamp) > new Date(existing.alert.timestamp)) existing.alert = alert;
    } else {
      groups.set(key, { alert, count: 1, ids: [alert.id] });
    }
  }
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.alert.timestamp).getTime() - new Date(a.alert.timestamp).getTime()
  );
}

function getHumanTitle(alert: Alert, details?: AlertDetails | null): string {
  if (details?.title) return details.title;
  const msg = alert.message;
  if (msg.length > 60) return msg.substring(0, 57) + "...";
  return msg;
}

function getHumanDescription(alert: Alert, details: AlertDetails | null): string {
  if (details?.description) return details.description;
  switch (alert.type) {
    case "stuck": {
      const mins = details?.context?.stuckDurationMinutes;
      const name = details?.agent?.name || "An agent";
      return mins
        ? `${name} hasn't responded for ${mins} minutes, which usually means it's frozen or crashed.`
        : `${name} stopped sending heartbeats, which usually means it's frozen or crashed.`;
    }
    case "error": {
      const name = details?.agent?.name || "An agent";
      const errCount = details?.relatedErrors?.length || 0;
      return errCount > 1
        ? `${name} encountered ${errCount} errors recently, which may indicate a recurring problem that needs attention.`
        : `${name} encountered errors recently that may need attention.`;
    }
    case "cost_spike": {
      const name = details?.agent?.name || "An agent";
      const current = details?.context?.currentCostUsd;
      const threshold = details?.context?.thresholdUsd;
      return current && threshold
        ? `${name} has spent $${current.toFixed(2)}, which is above the $${threshold.toFixed(2)} threshold.`
        : `${name} exceeded its cost threshold, which could indicate excessive API usage.`;
    }
    case "loop_detected": {
      const name = details?.agent?.name || "An agent";
      return `${name} appears to be producing the same output repeatedly, suggesting it's stuck in a retry loop.`;
    }
    default:
      return "An issue was detected that may need your attention.";
  }
}

// --- Types ---
type AlertFilter = "all" | "critical" | "warning" | "info";
const ALERTS_PER_PAGE = 5;

export interface AgentsTabProps {
  agents: Agent[];
  alerts: Alert[];
  alertsTotal: number;
  costs: CostData | null;
  spendData: SpendData | null;
  showIdleAgents: boolean;
  setShowIdleAgents: (v: boolean) => void;
  alertFilter: AlertFilter;
  setAlertFilter: (f: AlertFilter) => void;
  alertPage: number;
  setAlertPage: (p: number) => void;
  onPauseResume: (agent: Agent) => void;
  onAcknowledge: (alertId: string) => void;
  onAcknowledgeAll: () => void;
  ackAllLoading: boolean;
  onToggleAlertDetails: (alertId: string) => void;
  expandedAlerts: Record<string, AlertDetails | "loading">;
  prefetchedDetails: Record<string, AlertDetails>;
  showStackTrace: Record<string, boolean>;
  setShowStackTrace: (v: Record<string, boolean>) => void;
}

export function AgentsTab({
  agents, alerts, alertsTotal, costs, spendData,
  showIdleAgents, setShowIdleAgents,
  alertFilter, setAlertFilter, alertPage, setAlertPage,
  onPauseResume, onAcknowledge, onAcknowledgeAll, ackAllLoading,
  onToggleAlertDetails, expandedAlerts, prefetchedDetails, showStackTrace, setShowStackTrace,
}: AgentsTabProps) {
  const aggregatedAlerts = aggregateAlerts(alerts);

  return (
    <>
      {/* Agent List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Active Agents</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showIdleAgents}
              onChange={(e) => setShowIdleAgents(e.target.checked)}
              className="rounded border-border bg-muted accent-emerald-500"
            />
            Show idle agents
          </label>
        </div>
        <div className="grid gap-3">
          {agents.map((agent) => {
            const sc = statusConfig[agent.status] || statusConfig.idle;
            return (
              <div key={agent.id} className="rounded-xl border border-border/50 bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:border-border transition-colors">
                <div className="flex items-center gap-3 min-w-0 sm:min-w-[200px]">
                  <span className={`size-2.5 rounded-full shrink-0 ${sc.dot}`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{agent.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{agent.host}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`${sc.color} border text-xs`}>{sc.label}</Badge>
                  {agent.overLimit && agent.limit != null && (() => {
                    const spend = agent.limitType === "daily" ? (agent.todaySpend ?? 0) : (agent.mtdSpend ?? 0);
                    const over = spend - agent.limit;
                    return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 border text-xs">⚠️ ${over.toFixed(2)} over</Badge>;
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-6 sm:ml-auto text-sm text-muted-foreground">
                  <div className="text-left sm:text-right">
                    <div className="text-foreground font-medium">${agent.costUsd.toFixed(2)}</div>
                    <div className="text-xs">cost</div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-foreground font-medium">{formatTokens(agent.tokenCount)}</div>
                    <div className="text-xs">tokens</div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className={`font-medium ${agent.errorCount > 0 ? "text-red-400" : "text-foreground"}`}>{agent.errorCount}</div>
                    <div className="text-xs">errors</div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-foreground font-medium">{formatRelativeTime(agent.lastHeartbeat)}</div>
                    <div className="text-xs">heartbeat</div>
                  </div>
                </div>
                {(agent.status === "running" || agent.status === "paused") && (
                  <div className="sm:ml-2">
                    <Button variant="outline" size="sm" onClick={() => onPauseResume(agent)} className="w-full sm:w-auto text-xs">
                      {agent.status === "running" ? "Pause" : "Resume"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {agents.length === 0 && (
            <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
              <div className="text-4xl mb-3">😴</div>
              <div className="text-sm font-medium text-muted-foreground">No active agents</div>
              <div className="text-xs text-muted-foreground/60 mt-1">All agents are idle or stopped.</div>
            </div>
          )}
        </div>
      </div>

      {/* Cost Overview */}
      {costs && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-4">Cost by Agent</h2>
            <Card>
              <CardContent className="pt-4 space-y-3">
                {costs.byAgent.sort((a, b) => b.costUsd - a.costUsd).map((item) => {
                  const agentSpend = spendData?.byAgent[item.agentId];
                  const agentLimit = spendData?.limits.agentLimits[item.agentId];
                  const limitType = spendData?.limits.type;
                  const relevantSpend = limitType === "daily" ? agentSpend?.today : agentSpend?.mtd;
                  const isOver = agentLimit != null && relevantSpend != null && relevantSpend > agentLimit;
                  const hasLimit = agentLimit != null && agentLimit > 0;
                  const barPercent = hasLimit && relevantSpend != null ? Math.min(100, (relevantSpend / agentLimit!) * 100) : (item.costUsd / costs.totalUsd) * 100;
                  const withinPercent = hasLimit && relevantSpend != null && isOver ? (agentLimit! / relevantSpend) * 100 : 100;
                  return (
                    <div key={item.agentId} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.name}</span>
                          {isOver && <span className="text-[10px] text-red-400 font-medium">⚠️ ${((relevantSpend ?? 0) - agentLimit!).toFixed(2)} over</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                            {hasLimit && isOver ? (
                              <div className="h-full flex" style={{ width: `${barPercent}%` }}>
                                <div className="h-full bg-emerald-500" style={{ width: `${withinPercent}%` }} />
                                <div className="h-full bg-red-500 flex-1" />
                              </div>
                            ) : (
                              <div className={`h-full rounded-full ${hasLimit && relevantSpend != null && (relevantSpend / agentLimit!) > 0.8 ? "bg-amber-500" : hasLimit && relevantSpend != null && (relevantSpend / agentLimit!) > 0.6 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${barPercent}%` }} />
                            )}
                          </div>
                          <span className="text-sm font-medium w-24 text-right">${item.costUsd.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 pl-1">
                        <span>{limitType === "daily" ? "Today" : "MTD"}: ${relevantSpend?.toFixed(2) ?? "—"}{hasLimit ? ` / $${agentLimit} limit` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-4">Cost by Model</h2>
            <Card>
              <CardContent className="pt-4 space-y-3">
                {costs.byModel.sort((a, b) => b.costUsd - a.costUsd).map((item) => (
                  <div key={item.model} className="flex items-center justify-between">
                    <span className="text-sm font-mono">{item.model}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(item.costUsd / costs.totalUsd) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">${item.costUsd.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* All Alerts */}
      <div id="alerts-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">All Alerts</h2>
          <Button variant="outline" size="sm" className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" disabled={ackAllLoading || alerts.every((a) => a.acknowledged)} onClick={onAcknowledgeAll}>
            {ackAllLoading ? "Acknowledging..." : `Acknowledge All${alertFilter !== "all" ? ` ${alertFilter}` : ""}`}
          </Button>
        </div>

        <div className="flex items-center gap-1 mb-4">
          {(["all", "critical", "warning", "info"] as AlertFilter[]).map((f) => (
            <button key={f} onClick={() => setAlertFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${alertFilter === f ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-4 space-y-2">
            {aggregatedAlerts.map(({ alert, count, ids }) => {
              const sc = severityConfig[alert.severity];
              const expanded = expandedAlerts[alert.id];
              const isExpanded = !!expanded;
              const isLoading = expanded === "loading";
              const details = expanded && expanded !== "loading" ? expanded : prefetchedDetails[alert.id] || null;
              const isStackVisible = showStackTrace[alert.id] || false;
              const humanTitle = getHumanTitle(alert, details);
              return (
                <div key={alert.id} className={`rounded-lg overflow-hidden ${alert.acknowledged ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => onToggleAlertDetails(alert.id)}>
                    <div className="flex items-center gap-3">
                      <svg className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                      <Badge variant="outline" className={`${sc.color} border text-[10px] uppercase font-bold`}>{alert.severity}</Badge>
                      <span className="font-medium">{humanTitle}</span>
                      {count > 1 && <Badge variant="outline" className="text-[10px] text-muted-foreground">×{count}</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.timestamp)}</span>
                      {!alert.acknowledged && (
                        <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); ids.forEach((id) => onAcknowledge(id)); }}>
                          Ack{count > 1 ? ` all` : ""}
                        </Button>
                      )}
                      {alert.acknowledged && <span className="text-xs text-muted-foreground">Acked</span>}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 ml-6 border-t border-border/30">
                      {isLoading ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                          <div className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Loading details...
                        </div>
                      ) : details ? (
                        <div className="pt-3 space-y-3">
                          <p className="text-sm text-foreground/80 leading-relaxed">{getHumanDescription(alert, details)}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Agent:</span>
                            <span className="font-medium text-foreground">{details.agent.name}</span>
                            {count > 1 && <span className="text-muted-foreground">· Occurred {count} times</span>}
                          </div>
                          {(details.relatedErrors.length > 0 || details.context?.stuckDurationMinutes != null || details.context?.currentCostUsd != null) && (
                            <div>
                              <button onClick={(e) => { e.stopPropagation(); setShowStackTrace({ ...showStackTrace, [alert.id]: !showStackTrace[alert.id] }); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                <svg className={`size-3 transition-transform ${isStackVisible ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                                {isStackVisible ? "Hide technical details" : `Show technical details${details.relatedErrors.length > 0 ? ` (${details.relatedErrors.length} error${details.relatedErrors.length > 1 ? "s" : ""})` : ""}`}
                              </button>
                              {isStackVisible && (
                                <div className="mt-2 pl-4 border-l-2 border-border/30 space-y-1.5">
                                  {details.context?.stuckDurationMinutes != null && (
                                    <div className="text-xs text-amber-400/80 font-mono">Stuck for {details.context.stuckDurationMinutes}m — last heartbeat {formatRelativeTime(details.context.lastHeartbeat!)}</div>
                                  )}
                                  {details.context?.currentCostUsd != null && (
                                    <div className="text-xs text-amber-400/80 font-mono">Current: ${details.context.currentCostUsd.toFixed(2)} / Threshold: ${details.context.thresholdUsd?.toFixed(2)} (+${details.context.overage?.toFixed(2)} over)</div>
                                  )}
                                  {Object.values(
                                    details.relatedErrors.reduce((acc, err) => {
                                      const key = err.error;
                                      if (!acc[key]) acc[key] = { error: key, count: 0, lastTimestamp: err.timestamp };
                                      acc[key].count++;
                                      if (err.timestamp > acc[key].lastTimestamp) acc[key].lastTimestamp = err.timestamp;
                                      return acc;
                                    }, {} as Record<string, { error: string; count: number; lastTimestamp: string }>)
                                  ).map((group, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                                      <span className="text-muted-foreground shrink-0 w-16">{formatRelativeTime(group.lastTimestamp)}</span>
                                      <span className="font-mono text-red-400/80 break-all">{group.error}</span>
                                      {group.count > 1 && <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">×{group.count}</Badge>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            {alerts.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">No alerts found.</div>}
          </CardContent>
        </Card>

        {alertsTotal > ALERTS_PER_PAGE && (
          <div className="flex items-center justify-between mt-3">
            <Button variant="outline" size="sm" className="text-xs" disabled={alertPage <= 1} onClick={() => setAlertPage(alertPage - 1)}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {alertPage} of {Math.ceil(alertsTotal / ALERTS_PER_PAGE)}</span>
            <Button variant="outline" size="sm" className="text-xs" disabled={alertPage >= Math.ceil(alertsTotal / ALERTS_PER_PAGE)} onClick={() => setAlertPage(alertPage + 1)}>Next</Button>
          </div>
        )}
      </div>
    </>
  );
}
