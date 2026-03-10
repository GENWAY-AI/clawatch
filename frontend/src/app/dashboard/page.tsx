"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent, Alert, CostData, AgentStatus, AlertSeverity, Session, SessionStatus, Project, Profile } from "@/lib/types";
import { getAgents, getAlerts, getCosts, pauseAgent, resumeAgent, acknowledgeAlert, acknowledgeAllAlerts, getSessions, getProjects, createProject, getProfiles, getVersion, setSessionProjects, removeSessionProject } from "@/lib/api";
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
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Active" },
  idle: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Idle" },
  paused: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Paused" },
  stopped: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Stopped" },
  error: { color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400", label: "Error" },
  stuck: { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400 animate-pulse", label: "Stuck" },
};

const sessionStatusConfig: Record<SessionStatus, { color: string; dot: string; label: string }> = {
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Active" },
  idle: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Idle" },
  completed: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Completed" },
};

const agentColors: Record<string, string> = {
  ofek: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  anas: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  dor: "bg-teal-500/10 text-teal-400 border-teal-500/20",
};

const severityConfig: Record<AlertSeverity, { color: string; icon: string }> = {
  critical: { color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "!" },
  warning: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: "!" },
  info: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "i" },
};

type Tab = "agents" | "sessions" | "projects";
type SessionFilter = "all" | "active" | "idle" | "completed";
type SessionSort = "recent" | "cost" | "tokens";
type AlertFilter = "all" | "critical" | "warning" | "info";

const ALERTS_PER_PAGE = 5;

function ProjectTagChips({
  session,
  allProjects,
  onAdd,
  onRemove,
}: {
  session: Session;
  allProjects: Project[];
  onAdd: (projectId: string) => void;
  onRemove: (projectId: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sessionProjects = session.projects ?? [];
  const taggedIds = new Set(sessionProjects.map((p) => p.id));
  const available = allProjects.filter((p) => !taggedIds.has(p.id));

  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  if (sessionProjects.length === 0 && available.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 group/tags">
      {sessionProjects.map((proj) => (
        <span
          key={proj.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
        >
          {proj.name}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(proj.id);
            }}
            className="hover:text-amber-200 transition-colors ml-0.5 leading-none"
          >
            &times;
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
            }}
            className="inline-flex items-center justify-center size-5 rounded-full border border-dashed border-zinc-600 text-zinc-500 hover:border-amber-500/40 hover:text-amber-400 transition-colors text-[11px] opacity-0 group-hover/tags:opacity-100 focus:opacity-100"
            title="Add project tag"
          >
            +
          </button>
          {showDropdown && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border/50 bg-zinc-900 shadow-lg py-1">
              {available.map((proj) => (
                <button
                  key={proj.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(proj.id);
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
                >
                  {proj.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("active");
  const [sessionSort, setSessionSort] = useState<SessionSort>("recent");
  const [showIdleAgents, setShowIdleAgents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [ackAllLoading, setAckAllLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [version, setVersion] = useState<string | null>(null);

  const selectedProfile = searchParams.get("profile") || "default";
  const alertFilter = (searchParams.get("alertSeverity") as AlertFilter) || "all";
  const alertPage = Math.max(1, parseInt(searchParams.get("alertPage") || "1", 10));

  function setAlertFilter(filter: AlertFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") {
      params.delete("alertSeverity");
    } else {
      params.set("alertSeverity", filter);
    }
    params.delete("alertPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setAlertPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("alertPage");
    } else {
      params.set("alertPage", String(page));
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setSelectedProfile(profileId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", profileId || "default");
    params.delete("alertPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    Promise.all([getProfiles(), getVersion()]).then(([p, v]) => {
      setProfiles(p);
      setVersion(v);
    });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const agentStatus = showIdleAgents ? "all" : undefined;
      const sessStatus = sessionFilter === "all" ? "all" : sessionFilter === "active" ? undefined : sessionFilter;
      const severityParam = alertFilter !== "all" ? (alertFilter as AlertSeverity) : undefined;
      const offset = (alertPage - 1) * ALERTS_PER_PAGE;
      const prof = selectedProfile;
      const [a, al, allAl, c, s, p] = await Promise.all([
        getAgents(agentStatus, prof),
        getAlerts({ limit: ALERTS_PER_PAGE, offset, severity: severityParam, profile: prof }),
        getAlerts({ profile: prof }),
        getCosts(prof),
        getSessions(undefined, sessStatus, sessionSort, prof),
        getProjects(prof),
      ]);
      setAgents(a);
      setAlerts(al.alerts);
      setAlertsTotal(al.total);
      setAllAlerts(allAl.alerts);
      setCosts(c);
      setSessions(s);
      setProjects(p);
    } finally {
      setLoading(false);
    }
  }, [showIdleAgents, sessionFilter, sessionSort, alertFilter, alertPage, selectedProfile]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const unackedAlerts = allAlerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unackedAlerts.filter((a) => a.severity === "critical" || a.severity === "warning");
  const bannerAlerts = criticalAlerts.slice(0, 3);
  const hiddenBannerCount = criticalAlerts.length - bannerAlerts.length;
  const runningCount = agents.filter((a) => a.status === "running" || a.status === "active").length;
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
    setAllAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
  }

  async function handleAcknowledgeAll() {
    setAckAllLoading(true);
    const severityParam = alertFilter !== "all" ? (alertFilter as AlertSeverity) : undefined;
    // Optimistic update
    const prevAlerts = alerts;
    const prevAllAlerts = allAlerts;
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
    setAllAlerts((prev) =>
      prev.map((a) =>
        !severityParam || a.severity === severityParam ? { ...a, acknowledged: true } : a
      )
    );
    try {
      await acknowledgeAllAlerts(severityParam);
    } catch {
      // Rollback on error
      setAlerts(prevAlerts);
      setAllAlerts(prevAllAlerts);
    } finally {
      setAckAllLoading(false);
    }
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
          <div className="flex items-center gap-4">
            {profiles.length > 0 && (
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="bg-zinc-900 border border-border/50 rounded-md px-2.5 py-1 text-xs text-muted-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer appearance-none pr-6"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </div>
            {version && (
              <span className="text-[10px] text-muted-foreground/60">v{version}</span>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Alert Banner */}
        {bannerAlerts.length > 0 && (
          <div className="space-y-2">
            {bannerAlerts.map((alert) => (
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
            {hiddenBannerCount > 0 && (
              <button
                onClick={() => {
                  const alertsSection = document.getElementById("alerts-section");
                  if (alertsSection) alertsSection.scrollIntoView({ behavior: "smooth" });
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-4 py-1.5"
              >
                +{hiddenBannerCount} more alert{hiddenBannerCount > 1 ? "s" : ""} — view all below ↓
              </button>
            )}
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
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

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border/50">
          <button
            onClick={() => setTab("agents")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === "agents"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Agents
            {tab === "agents" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setTab("sessions")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === "sessions"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sessions
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
              {sessions.length}
            </Badge>
            {tab === "sessions" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setTab("projects")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === "projects"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Projects
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
              {projects.length}
            </Badge>
            {tab === "projects" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Agents Tab */}
        {tab === "agents" && (
          <>
            {/* Agent List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Agents</h2>
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
            <div id="alerts-section">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">All Alerts</h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  disabled={ackAllLoading || alerts.every((a) => a.acknowledged)}
                  onClick={handleAcknowledgeAll}
                >
                  {ackAllLoading ? "Acknowledging..." : `Acknowledge All${alertFilter !== "all" ? ` ${alertFilter}` : ""}`}
                </Button>
              </div>

              {/* Severity Filter Chips */}
              <div className="flex items-center gap-1 mb-4">
                {(["all", "critical", "warning", "info"] as AlertFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAlertFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      alertFilter === f
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

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
                  {alerts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No alerts found.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pagination */}
              {alertsTotal > ALERTS_PER_PAGE && (
                <div className="flex items-center justify-between mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={alertPage <= 1}
                    onClick={() => setAlertPage(alertPage - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {alertPage} of {Math.ceil(alertsTotal / ALERTS_PER_PAGE)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={alertPage >= Math.ceil(alertsTotal / ALERTS_PER_PAGE)}
                    onClick={() => setAlertPage(alertPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Sessions Tab */}
        {tab === "sessions" && (
          <div>
            {/* Filters + Sort */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                {(["all", "active", "idle", "completed"] as SessionFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSessionFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      sessionFilter === f
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground mr-1">Sort:</span>
                {(["recent", "cost", "tokens"] as SessionSort[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSessionSort(s)}
                    className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                      sessionSort === s
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Session Cards */}
            <div className="grid gap-3">
              {sessions.map((session) => {
                const sc = sessionStatusConfig[session.status];
                return (
                  <div
                    key={session.id}
                    onClick={() => router.push(`/dashboard/sessions/${session.id}`)}
                    className="rounded-xl border border-border/50 bg-card p-4 hover:border-border transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start gap-4">
                      {/* Status dot */}
                      <span className={`size-2.5 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate max-w-[500px] group-hover:text-emerald-400 transition-colors">
                            {session.title.length > 80 ? session.title.slice(0, 80) + "..." : session.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] border ${agentColors[session.agentId] || "text-zinc-400"}`}>
                            {session.agentId}
                          </Badge>

                          <span className="text-[11px] font-mono text-muted-foreground">
                            {session.model}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {session.messageCount} msgs
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatRelativeTime(session.lastActivityAt)}
                          </span>
                        </div>
                        <ProjectTagChips
                          session={session}
                          allProjects={projects}
                          onRemove={async (projectId) => {
                            const prev = session.projects ?? [];
                            setSessions((s) =>
                              s.map((sess) =>
                                sess.id === session.id
                                  ? { ...sess, projects: prev.filter((p) => p.id !== projectId) }
                                  : sess
                              )
                            );
                            try {
                              await removeSessionProject(session.id, projectId);
                            } catch {
                              setSessions((s) =>
                                s.map((sess) => (sess.id === session.id ? { ...sess, projects: prev } : sess))
                              );
                            }
                          }}
                          onAdd={async (projectId) => {
                            const proj = projects.find((p) => p.id === projectId);
                            if (!proj) return;
                            const prev = session.projects ?? [];
                            const next = [...prev, { id: proj.id, name: proj.name }];
                            setSessions((s) =>
                              s.map((sess) =>
                                sess.id === session.id ? { ...sess, projects: next } : sess
                              )
                            );
                            try {
                              await setSessionProjects(session.id, next.map((p) => p.id));
                            } catch {
                              setSessions((s) =>
                                s.map((sess) => (sess.id === session.id ? { ...sess, projects: prev } : sess))
                              );
                            }
                          }}
                        />
                      </div>

                      {/* Right stats */}
                      <div className="flex items-center gap-4 shrink-0 text-sm">
                        <div className="text-right">
                          <div className="font-bold">${session.costUsd.toFixed(2)}</div>
                          <div className="text-[11px] text-muted-foreground">{formatTokens(session.tokenCount)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {sessions.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No sessions found for the selected filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {tab === "projects" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Projects</h2>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => setShowNewProject(!showNewProject)}
              >
                {showNewProject ? "Cancel" : "+ New Project"}
              </Button>
            </div>

            {/* New Project Form */}
            {showNewProject && (
              <Card className="mb-4">
                <CardContent className="pt-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                  />
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    disabled={!newProjectName.trim()}
                    onClick={async () => {
                      const p = await createProject(newProjectName.trim(), newProjectDesc.trim());
                      setProjects((prev) => [p, ...prev]);
                      setNewProjectName("");
                      setNewProjectDesc("");
                      setShowNewProject(false);
                    }}
                  >
                    Create Project
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Project Cards */}
            <div className="grid gap-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                  className="rounded-xl border border-border/50 bg-card p-5 hover:border-emerald-500/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base group-hover:text-emerald-400 transition-colors mb-1">
                        {project.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                        {project.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{project.sessionCount} sessions</span>
                        <span>{formatRelativeTime(project.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="text-xl font-bold">${project.totalCostUsd.toFixed(2)}</div>
                      <div className="text-[11px] text-muted-foreground">total cost</div>
                    </div>
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No projects yet. Create one to group sessions together.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
