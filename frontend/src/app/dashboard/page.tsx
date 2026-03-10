"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent, Alert, CostData, AgentStatus, AlertSeverity, Session, SessionStatus, Project, Profile, AnalyticsData } from "@/lib/types";
import { getAgents, getAlerts, getCosts, pauseAgent, resumeAgent, acknowledgeAlert, acknowledgeAllAlerts, getSessions, getProjects, createProject, getProfiles, getVersion, setSessionProjects, removeSessionProject, getAnalytics } from "@/lib/api";
import { ClaWatchLogo, ClaWatchIcon } from "@/components/clawatch-logo";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

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

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimeline(first: string, last: string): string {
  const f = new Date(first);
  const l = new Date(last);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (f.toDateString() === l.toDateString()) return fmt(f);
  return `${fmt(f)} – ${fmt(l)}`;
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

type Tab = "agents" | "sessions" | "projects" | "analytics";
type SessionFilter = "all" | "active" | "idle" | "completed";
type SessionSort = "recent" | "cost" | "tokens";
type AlertFilter = "all" | "critical" | "warning" | "info";

const ALERTS_PER_PAGE = 5;
const SESSIONS_PER_PAGE = 10;

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
  const tabParam = searchParams.get("tab") as Tab | null;
  const [tab, setTabRaw] = useState<Tab>(tabParam && ["agents", "sessions", "projects", "analytics"].includes(tabParam) ? tabParam : "agents");

  function setTab(t: Tab) {
    setTabRaw(t);
    const params = new URLSearchParams(searchParams.toString());
    if (t === "agents") {
      params.delete("tab");
    } else {
      params.set("tab", t);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [agents, setAgents] = useState<Agent[]>([]);
  const [totalAgentCount, setTotalAgentCount] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const sessionFilterParam = searchParams.get("sessionFilter") as SessionFilter | null;
  const sessionSortParam = searchParams.get("sessionSort") as SessionSort | null;
  const [sessionFilter, setSessionFilterRaw] = useState<SessionFilter>(
    sessionFilterParam && ["all", "active", "idle", "completed"].includes(sessionFilterParam) ? sessionFilterParam : "active"
  );
  const [sessionSort, setSessionSortRaw] = useState<SessionSort>(
    sessionSortParam && ["recent", "cost", "tokens"].includes(sessionSortParam) ? sessionSortParam : "recent"
  );
  const [showIdleAgents, setShowIdleAgents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [ackAllLoading, setAckAllLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const selectedProfile = searchParams.get("profile") || "default";
  const analyticsGroupBy = (searchParams.get("groupBy") as "day" | "week") || "day";
  const alertFilter = (searchParams.get("alertSeverity") as AlertFilter) || "all";
  const alertPage = Math.max(1, parseInt(searchParams.get("alertPage") || "1", 10));
  const sessionPage = Math.max(1, parseInt(searchParams.get("sessionPage") || "1", 10));

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

  function setSessionFilter(f: SessionFilter) {
    setSessionFilterRaw(f);
    const params = new URLSearchParams(searchParams.toString());
    if (f === "active") {
      params.delete("sessionFilter");
    } else {
      params.set("sessionFilter", f);
    }
    params.delete("sessionPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setSessionSort(s: SessionSort) {
    setSessionSortRaw(s);
    const params = new URLSearchParams(searchParams.toString());
    if (s === "recent") {
      params.delete("sessionSort");
    } else {
      params.set("sessionSort", s);
    }
    params.delete("sessionPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setSessionPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("sessionPage");
    } else {
      params.set("sessionPage", String(page));
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setSelectedProfile(profileId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", profileId || "default");
    params.delete("alertPage");
    params.delete("sessionPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setAnalyticsGroupByParam(g: "day" | "week") {
    const params = new URLSearchParams(searchParams.toString());
    if (g === "day") {
      params.delete("groupBy");
    } else {
      params.set("groupBy", g);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Fetch analytics data only when the Analytics tab is active
  useEffect(() => {
    if (tab !== "analytics") return;
    let cancelled = false;
    setAnalyticsLoading(true);
    getAnalytics({ profile: selectedProfile, groupBy: analyticsGroupBy }).then((data) => {
      if (!cancelled) {
        setAnalyticsData(data);
        setAnalyticsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setAnalyticsLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, selectedProfile, analyticsGroupBy]);

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
      const alertOffset = (alertPage - 1) * ALERTS_PER_PAGE;
      const sessionOffset = (sessionPage - 1) * SESSIONS_PER_PAGE;
      const prof = selectedProfile;
      const [a, allAgents, al, allAl, c, sessResult, p] = await Promise.all([
        getAgents(agentStatus, prof),
        getAgents("all", prof),
        getAlerts({ limit: ALERTS_PER_PAGE, offset: alertOffset, severity: severityParam, profile: prof }),
        getAlerts({ profile: prof }),
        getCosts(prof),
        getSessions({ status: sessStatus, sort: sessionSort, profile: prof, limit: SESSIONS_PER_PAGE, offset: sessionOffset }),
        getProjects(prof),
      ]);
      setAgents(a);
      setTotalAgentCount(allAgents.length);
      setAlerts(al.alerts);
      setAlertsTotal(al.total);
      setAllAlerts(allAl.alerts);
      setCosts(c);
      setSessions(sessResult.sessions);
      setSessionsTotal(sessResult.total);
      setProjects(p);
    } finally {
      setLoading(false);
    }
  }, [showIdleAgents, sessionFilter, sessionSort, alertFilter, alertPage, sessionPage, selectedProfile]);

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
              <div className="text-3xl font-bold">{totalAgentCount}</div>
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
            Active Agents
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
              {agents.length}
            </Badge>
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
              {sessionsTotal || sessions.length}
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
          <button
            onClick={() => setTab("analytics")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === "analytics"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Analytics
            {tab === "analytics" && (
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
                {agents.length === 0 && (
                  <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
                    <div className="text-4xl mb-3">😴</div>
                    <div className="text-sm font-medium text-muted-foreground">No active agents</div>
                    <div className="text-xs text-muted-foreground/60 mt-1">All agents are idle or stopped. Check back soon!</div>
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

            {/* Session Pagination */}
            {sessionsTotal > SESSIONS_PER_PAGE && (
              <div className="flex items-center justify-between mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={sessionPage <= 1}
                  onClick={() => setSessionPage(sessionPage - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {sessionPage} of {Math.ceil(sessionsTotal / SESSIONS_PER_PAGE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={sessionPage >= Math.ceil(sessionsTotal / SESSIONS_PER_PAGE)}
                  onClick={() => setSessionPage(sessionPage + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {analyticsLoading || !analyticsData ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
                <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Loading analytics...
              </div>
            ) : (
              <>
                {/* Time controls */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground mr-1">Group by:</span>
                  {(["day", "week"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setAnalyticsGroupByParam(g)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        analyticsGroupBy === g
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Summary stats */}
                {(() => {
                  const totalCostPeriod = analyticsData.buckets.reduce((s, b) => s + b.costUsd, 0);
                  const totalTokens = analyticsData.buckets.reduce((s, b) => s + b.tokenCount, 0);
                  const totalSessions = analyticsData.buckets.reduce((s, b) => s + b.sessionCount, 0);
                  const avgDailyCost = analyticsData.buckets.length > 0 ? totalCostPeriod / analyticsData.buckets.length : 0;
                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Period Cost</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">${totalCostPeriod.toFixed(2)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">{formatTokens(totalTokens)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">{totalSessions}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Avg Daily Cost</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">${avgDailyCost.toFixed(2)}</div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}

                {/* Total usage over time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Total Usage Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analyticsData.buckets}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                          <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                            labelStyle={{ color: "#a1a1aa" }}
                            labelFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                            formatter={(value, name) => {
                              const v = Number(value);
                              if (name === "costUsd") return [`$${v.toFixed(2)}`, "Cost"];
                              if (name === "tokenCount") return [formatTokens(v), "Tokens"];
                              if (name === "sessionCount") return [v, "Sessions"];
                              return [v, String(name)];
                            }}
                          />
                          <Area type="monotone" dataKey="costUsd" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
                          <Area type="monotone" dataKey="tokenCount" stroke="transparent" fill="transparent" />
                          <Area type="monotone" dataKey="sessionCount" stroke="transparent" fill="transparent" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Usage by Agent */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Usage by Agent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        {(() => {
                          const agentChartColors: Record<string, string> = {
                            ofek: "#3b82f6",
                            anas: "#a855f7",
                            dor: "#14b8a6",
                          };
                          const defaultColors = ["#6366f1", "#ec4899", "#f59e0b", "#84cc16", "#06b6d4"];
                          const dates = analyticsData.buckets.map((b) => b.date);
                          const merged = dates.map((date) => {
                            const row: Record<string, string | number> = { date };
                            for (const agent of analyticsData.byAgent) {
                              const bucket = agent.buckets.find((b) => b.date === date);
                              row[agent.agentId] = bucket?.costUsd ?? 0;
                            }
                            return row;
                          });
                          return (
                            <AreaChart data={merged}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                              <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                              <Tooltip
                                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                                labelStyle={{ color: "#a1a1aa" }}
                                labelFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name)]}
                              />
                              <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }} />
                              {analyticsData.byAgent.map((agent, i) => {
                                const color = agentChartColors[agent.agentId] || defaultColors[i % defaultColors.length];
                                return (
                                  <Area key={agent.agentId} type="monotone" dataKey={agent.agentId} stackId="1" stroke={color} fill={color} fillOpacity={0.3} strokeWidth={2} />
                                );
                              })}
                            </AreaChart>
                          );
                        })()}
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Usage by Project */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Usage by Project</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        {(() => {
                          const projectColors = ["#f59e0b", "#f97316", "#fb7185", "#e879f9", "#a78bfa"];
                          const dates = analyticsData.buckets.map((b) => b.date);
                          const merged = dates.map((date) => {
                            const row: Record<string, string | number> = { date };
                            for (const proj of analyticsData.byProject) {
                              const bucket = proj.buckets.find((b) => b.date === date);
                              row[proj.name] = bucket?.costUsd ?? 0;
                            }
                            return row;
                          });
                          return (
                            <AreaChart data={merged}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                              <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                              <Tooltip
                                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                                labelStyle={{ color: "#a1a1aa" }}
                                labelFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name)]}
                              />
                              <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }} />
                              {analyticsData.byProject.map((proj, i) => {
                                const color = projectColors[i % projectColors.length];
                                return (
                                  <Area key={proj.projectId} type="monotone" dataKey={proj.name} stackId="1" stroke={color} fill={color} fillOpacity={0.3} strokeWidth={2} />
                                );
                              })}
                            </AreaChart>
                          );
                        })()}
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
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
                        {project.firstActivityAt && project.lastActivityAt && (
                          <span>{formatTimeline(project.firstActivityAt, project.lastActivityAt)}</span>
                        )}
                        {project.durationMs != null && project.durationMs > 0 && (
                          <span>{formatDuration(project.durationMs)}</span>
                        )}
                        {!project.firstActivityAt && (
                          <span>{formatRelativeTime(project.updatedAt)}</span>
                        )}
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
