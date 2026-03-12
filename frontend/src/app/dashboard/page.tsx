"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent, Alert, AlertDetails, CostData, AgentStatus, AlertSeverity, Session, SessionStatus, Project, Profile, AnalyticsData, SpendData, CostLimits } from "@/lib/types";
import { getAgents, getAlerts, getAlertDetails, getCosts, pauseAgent, resumeAgent, acknowledgeAlert, acknowledgeAllAlerts, getSessions, getProjects, createProject, getProfiles, getVersion, setSessionProjects, removeSessionProject, getAnalytics, getSpend, setCostLimits, isUsingMockData } from "@/lib/api";
import { ClaWatchLogo, ClaWatchIcon } from "@/components/clawatch-logo";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea } from "recharts";

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

function parseChartDate(d: string): Date {
  // Backend sends UTC dates like "2026-03-10T14:00" (no Z suffix) or "2026-03-10"
  // Append Z to ensure UTC parsing, then toLocale* converts to local time
  const s = String(d);
  if (s.includes("T") && !s.endsWith("Z")) return new Date(s + ":00Z");
  if (!s.includes("T")) return new Date(s + "T00:00:00Z");
  return new Date(s);
}

function formatChartDate(d: string, groupBy: string): string {
  const date = parseChartDate(d);
  if (groupBy === "hour") {
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
    return `${month} ${day} ${hours}:${mins}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const statusConfig: Record<AgentStatus, { color: string; dot: string; label: string; tooltip: string }> = {
  running: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Running", tooltip: "Agent is actively processing tasks. Heartbeat received within the last few minutes." },
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Active", tooltip: "Agent is online and responsive but not currently executing a task." },
  idle: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Idle", tooltip: "Agent has no active sessions. Last heartbeat was more than 5 minutes ago." },
  paused: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Paused", tooltip: "Agent was manually paused. It will not process new tasks until resumed." },
  stopped: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Stopped", tooltip: "Agent process is not running. Restart it to resume monitoring." },
  error: { color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400", label: "Error", tooltip: "Agent encountered an error. Check alerts for details." },
  stuck: { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400 animate-pulse", label: "Stuck", tooltip: "Agent appears stuck — no heartbeat or progress for an extended period." },
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

// --- Human-readable alert helpers ---

interface AggregatedAlert {
  /** The most recent alert in this group */
  alert: Alert;
  /** How many times this alert occurred */
  count: number;
  /** All alert IDs in this group (for acknowledging) */
  ids: string[];
}

function aggregateAlerts(alerts: Alert[]): AggregatedAlert[] {
  const groups = new Map<string, AggregatedAlert>();
  for (const alert of alerts) {
    // Group by: same type + same agentId + same severity
    const key = `${alert.type}::${alert.agentId}::${alert.severity}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.ids.push(alert.id);
      // Keep the most recent one
      if (new Date(alert.timestamp) > new Date(existing.alert.timestamp)) {
        existing.alert = alert;
      }
    } else {
      groups.set(key, { alert, count: 1, ids: [alert.id] });
    }
  }
  // Sort by most recent first
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.alert.timestamp).getTime() - new Date(a.alert.timestamp).getTime()
  );
}

function getHumanTitle(alert: Alert, details?: AlertDetails | null): string {
  if (details?.title) return details.title;
  // Fallback: use alert.message (now contains specific error text from backend)
  const msg = alert.message;
  if (msg.length > 60) return msg.substring(0, 57) + "...";
  return msg;
}

function getHumanDescription(alert: Alert, details: AlertDetails | null): string {
  // Prefer backend-provided description (specific to actual error content)
  if (details?.description) return details.description;
  // Fallback: generic descriptions by type
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
        ? `${name} has spent $${current.toFixed(2)}, which is above the $${threshold.toFixed(2)} threshold. This could indicate excessive API usage.`
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

function CostSettingsModal({
  limits,
  agents,
  onSave,
  onClose,
}: {
  limits: CostLimits;
  agents: string[];
  onSave: (limits: CostLimits) => Promise<void>;
  onClose: () => void;
}) {
  const [limitType, setLimitType] = useState<'daily' | 'monthly' | null>(limits.type);
  const [amount, setAmount] = useState<string>(limits.amount?.toString() ?? "");
  const [agentLimits, setAgentLimits] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(limits.agentLimits).map(([k, v]) => [k, v.toString()]))
  );
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Cost Limits</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Limit Type</label>
            <div className="flex gap-2">
              {([['daily', 'Daily'], ['monthly', 'Monthly'], [null, 'No Limit']] as const).map(([val, label]) => (
                <button
                  key={label}
                  onClick={() => setLimitType(val)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    limitType === val
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {limitType && (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                {limitType === 'daily' ? 'Daily' : 'Monthly'} Limit ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="e.g. 50"
              />
            </div>
          )}

          {limitType && agents.length > 0 && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Per-Agent Overrides</label>
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div key={agent} className="grid grid-cols-[140px_1fr] items-center gap-3">
                    <span className="text-sm text-zinc-300 truncate" title={agent}>{agent}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={agentLimits[agent] ?? ""}
                      onChange={(e) => setAgentLimits((prev) => ({ ...prev, [agent]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                      placeholder="No override"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const parsedAgentLimits: Record<string, number> = {};
                for (const [k, v] of Object.entries(agentLimits)) {
                  const n = parseFloat(v);
                  if (!isNaN(n) && n > 0) parsedAgentLimits[k] = n;
                }
                await onSave({
                  type: limitType,
                  amount: limitType ? (parseFloat(amount) || null) : null,
                  agentLimits: parsedAgentLimits,
                });
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
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
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, AlertDetails | "loading">>({});
  const expandedAlertsRef = useRef(expandedAlerts);
  expandedAlertsRef.current = expandedAlerts;
  const [prefetchedDetails, setPrefetchedDetails] = useState<Record<string, AlertDetails>>({});
  const [showStackTrace, setShowStackTrace] = useState<Record<string, boolean>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsAllTime, setAnalyticsAllTime] = useState<{ totalTokens: number; totalSessions: number } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [hiddenAgentSeries, setHiddenAgentSeries] = useState<Set<string>>(new Set());
  const [hiddenProjectSeries, setHiddenProjectSeries] = useState<Set<string>>(new Set());
  const [spendData, setSpendData] = useState<SpendData | null>(null);
  const [showingDemoData, setShowingDemoData] = useState(false);
  const [showCostSettings, setShowCostSettings] = useState(false);

  // Chart zoom state — zoom range derived from URL params (single source of truth)
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);
  const zoomFromParam = searchParams.get("zoomFrom");
  const zoomToParam = searchParams.get("zoomTo");
  const zoomRange = zoomFromParam && zoomToParam ? { left: zoomFromParam, right: zoomToParam } : null;

  const selectedProfile = searchParams.get("profile") || "default";
  type TimeWindow = "1h" | "24h" | "7d" | "30d" | "all" | "custom";
  const timeWindow = (searchParams.get("window") as TimeWindow) || "7d";
  const customFrom = searchParams.get("from") || "";
  const customTo = searchParams.get("to") || "";

  const timeWindowConfig: Record<Exclude<TimeWindow, "custom">, { label: string; groupBy: "hour" | "day"; periodLabel: string }> = {
    "1h": { label: "Last hour", groupBy: "hour", periodLabel: "Last hour" },
    "24h": { label: "Last 24h", groupBy: "hour", periodLabel: "Last 24 hours" },
    "7d": { label: "Last 7d", groupBy: "day", periodLabel: "Last 7 days" },
    "30d": { label: "Last 30d", groupBy: "day", periodLabel: "Last 30 days" },
    "all": { label: "All time", groupBy: "day", periodLabel: "All time" },
  };

  function getWindowDates(w: TimeWindow): { from?: string; to?: string } {
    const now = new Date();
    const toISO = (d: Date) => d.toISOString().slice(0, 16);
    switch (w) {
      case "1h": {
        const from = new Date(now.getTime() - 60 * 60 * 1000);
        return { from: toISO(from), to: toISO(now) };
      }
      case "24h": {
        const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return { from: toISO(from), to: toISO(now) };
      }
      case "7d": {
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: toISO(from), to: toISO(now) };
      }
      case "30d": {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { from: toISO(from), to: toISO(now) };
      }
      case "all":
        return {};
      case "custom":
        return { from: customFrom || undefined, to: customTo || undefined };
    }
  }

  const analyticsGroupBy: "hour" | "day" = timeWindow === "custom"
    ? "day"
    : (timeWindowConfig[timeWindow]?.groupBy ?? "day");

  const periodLabel = timeWindow === "custom"
    ? (customFrom && customTo ? `${customFrom} – ${customTo}` : "Custom range")
    : (timeWindowConfig[timeWindow]?.periodLabel ?? "Last 7 days");

  // Zoom-aware label for stat cards
  const activeLabel = (() => {
    if (zoomRange) {
      const leftDate = parseChartDate(zoomRange.left);
      const rightDate = parseChartDate(zoomRange.right);
      const rangeDays = (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000);
      const fmt = (d: Date) => rangeDays <= 3
        ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(leftDate)} — ${fmt(rightDate)}`;
    }
    return periodLabel;
  })();
  // Re-fetch with hourly granularity when zoomed into a small range
  const [zoomedAnalytics, setZoomedAnalytics] = useState<AnalyticsData | null>(null);
  const [zoomFetching, setZoomFetching] = useState(false);

  // Zoomed buckets: always filter to exact zoom range (API may return wider range)
  const zoomSource = zoomedAnalytics || analyticsData;
  const inZoomRange = (date: string) => {
    if (!zoomRange) return true;
    // Compare using parsed timestamps for reliable comparison across date formats
    const t = parseChartDate(date).getTime();
    const left = parseChartDate(zoomRange.left).getTime();
    let right = parseChartDate(zoomRange.right).getTime();
    // If right is a date-only string (no time component), extend to end of that day
    // so hourly data within the day isn't excluded
    if (!zoomRange.right.includes("T")) {
      right += 24 * 60 * 60 * 1000 - 1;
    }
    return t >= left && t <= right;
  };
  const zoomedBuckets = zoomRange && zoomSource
    ? (zoomedAnalytics ? zoomedAnalytics.buckets.filter((b) => inZoomRange(b.date)) : zoomSource.buckets.filter((b) => inZoomRange(b.date)))
    : analyticsData?.buckets ?? [];

  const zoomedByProject = zoomRange && zoomSource
    ? (zoomedAnalytics ? zoomedAnalytics.byProject : analyticsData!.byProject).map((proj) => ({
        ...proj,
        buckets: proj.buckets.filter((b) => inZoomRange(b.date)),
      }))
    : analyticsData?.byProject ?? [];

  const zoomedByAgent = zoomRange && zoomSource
    ? (zoomedAnalytics ? zoomedAnalytics.byAgent : analyticsData!.byAgent).map((agent) => ({
        ...agent,
        buckets: agent.buckets.filter((b) => inZoomRange(b.date)),
      }))
    : analyticsData?.byAgent ?? [];

  // Effective groupBy for chart formatting: hourly when zoomed with hourly data
  const effectiveGroupBy = zoomedAnalytics ? "hour" : analyticsGroupBy;

  // Tooltip date formatter — includes time when showing hourly data
  const formatTooltipDate = (label: string) => {
    const date = parseChartDate(label);
    if (effectiveGroupBy === "hour") {
      return date.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    }
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  // Chart zoom helpers — update URL params (source of truth)
  const setZoomParams = (left: string, right: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("zoomFrom", left);
    params.set("zoomTo", right);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const clearZoomParams = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("zoomFrom");
    params.delete("zoomTo");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Chart zoom handlers
  const [isDragging, setIsDragging] = useState(false);
  const handleZoomMouseDown = (e: Record<string, unknown>) => {
    if (e?.activeLabel) {
      setZoomLeft(String(e.activeLabel));
      setIsDragging(true);
    }
  };
  const handleZoomMouseMove = (e: Record<string, unknown>) => {
    if (zoomLeft && e?.activeLabel) setZoomRight(String(e.activeLabel));
  };
  const handleZoomMouseUp = () => {
    setIsDragging(false);
    if (zoomLeft && zoomRight && zoomLeft !== zoomRight) {
      const [left, right] = [zoomLeft, zoomRight].sort();
      // Enforce minimum zoom: at least 2 different data points selected
      setZoomParams(left, right);
    }
    setZoomLeft(null);
    setZoomRight(null);
  };
  const resetZoom = () => {
    clearZoomParams();
    setZoomLeft(null);
    setZoomRight(null);
    setZoomedAnalytics(null);
    prevZoomRange.current = null;
  };



  // Dynamic date formatting based on zoom level
  const zoomChartDateFormatter = (d: string) => {
    if (zoomRange) {
      const leftDate = parseChartDate(zoomRange.left);
      const rightDate = parseChartDate(zoomRange.right);
      const rangeDays = (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000);
      const date = parseChartDate(d);
      if (rangeDays <= 1) {
        // Under 1 day: show time only (HH:MM)
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
      if (rangeDays <= 7) {
        // Under 7 days: show date + time
        const month = date.toLocaleDateString("en-US", { month: "short" });
        return `${month} ${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
    }
    return formatChartDate(d, effectiveGroupBy);
  };

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
    setExpandedAlerts({});
    setShowStackTrace({});
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

  function setTimeWindowParam(w: TimeWindow) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("groupBy");
    params.delete("zoomFrom");
    params.delete("zoomTo");
    if (w === "7d") {
      params.delete("window");
    } else {
      params.set("window", w);
    }
    if (w !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setCustomDates(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", "custom");
    params.delete("groupBy");
    if (from) params.set("from", from); else params.delete("from");
    if (to) params.set("to", to); else params.delete("to");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Fetch analytics data only when the Analytics tab is active
  useEffect(() => {
    if (tab !== "analytics") return;
    let cancelled = false;
    setAnalyticsLoading(true);
    const { from, to } = getWindowDates(timeWindow);
    const fetches: Promise<void>[] = [
      getAnalytics({ profile: selectedProfile, groupBy: analyticsGroupBy, from, to }).then((data) => {
        if (!cancelled) setAnalyticsData(data);
      }),
    ];
    // When viewing a subset, also fetch all-time stats for tokens/sessions
    if (timeWindow !== "all") {
      fetches.push(
        getAnalytics({ profile: selectedProfile, groupBy: "day" }).then((allTime) => {
          if (!cancelled) {
            const totalTokens = allTime.buckets.reduce((s, b) => s + b.tokenCount, 0);
            const totalSessions = allTime.buckets.reduce((s, b) => s + b.sessionCount, 0);
            setAnalyticsAllTime({ totalTokens, totalSessions });
          }
        })
      );
    } else {
      setAnalyticsAllTime(null);
    }
    Promise.all(fetches).catch(() => {}).finally(() => {
      if (!cancelled) setAnalyticsLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedProfile, timeWindow, customFrom, customTo]);

  // Re-fetch with hourly granularity on first zoom into daily data
  // For nested zooms (already have hourly data), just filter — don't re-fetch
  const prevZoomRange = useRef<{ left: string; right: string } | null>(null);
  useEffect(() => {
    if (!zoomRange || !analyticsData) {
      setZoomedAnalytics(null);
      prevZoomRange.current = null;
      return;
    }
    // If we already have hourly data from a previous zoom, don't re-fetch —
    // the computed zoomedBuckets will filter it to the new range
    if (zoomedAnalytics && prevZoomRange.current) {
      prevZoomRange.current = zoomRange;
      return;
    }
    const leftDate = parseChartDate(zoomRange.left);
    const rightDate = parseChartDate(zoomRange.right);
    const rangeDays = (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000);
    // Only re-fetch hourly if we're on daily grouping
    if (analyticsGroupBy === "day") {
      let cancelled = false;
      setZoomFetching(true);
      // Fetch the full day range (not the narrow zoom) to support nested zooms
      const fetchLeft = zoomRange.left.includes("T") ? zoomRange.left.split("T")[0] : zoomRange.left;
      const fetchRightDate = new Date(parseChartDate(zoomRange.right).getTime() + 24 * 60 * 60 * 1000);
      const fetchRight = fetchRightDate.toISOString().slice(0, 10);
      getAnalytics({ profile: selectedProfile, groupBy: "hour", from: fetchLeft, to: fetchRight }).then((data) => {
        if (!cancelled) {
          setZoomedAnalytics(data);
          prevZoomRange.current = zoomRange;
        }
      }).catch(() => {}).finally(() => {
        if (!cancelled) setZoomFetching(false);
      });
      return () => { cancelled = true; };
    } else {
      setZoomedAnalytics(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomFromParam, zoomToParam, selectedProfile, analyticsData]);

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
      const [a, allAgents, al, allAl, c, sessResult, p, sp] = await Promise.all([
        getAgents(agentStatus, prof),
        getAgents("all", prof),
        getAlerts({ limit: ALERTS_PER_PAGE, offset: alertOffset, severity: severityParam, profile: prof }),
        getAlerts({ profile: prof }),
        getCosts({ profile: prof }),
        getSessions({ status: sessStatus, sort: sessionSort, profile: prof, limit: SESSIONS_PER_PAGE, offset: sessionOffset }),
        getProjects(prof),
        getSpend(prof),
      ]);
      setAgents(a);
      setTotalAgentCount(allAgents.length);
      setAlerts(al.alerts ?? al);
      setAlertsTotal(al.total ?? 0);
      setAllAlerts(allAl.alerts ?? allAl);
      setCosts(c);
      setSessions(sessResult.sessions);
      setSessionsTotal(sessResult.total);
      setProjects(p);
      setSpendData(sp);
      setShowingDemoData(isUsingMockData());
    } finally {
      setLoading(false);
    }
  }, [showIdleAgents, sessionFilter, sessionSort, alertFilter, alertPage, sessionPage, selectedProfile]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Auto-fetch details for visible alerts so titles show immediately
  useEffect(() => {
    if (alerts.length === 0) return;
    let cancelled = false;
    const fetchDetails = async () => {
      for (const alert of alerts) {
        if (cancelled) break;
        // Skip if already prefetched or expanded
        if (prefetchedDetails[alert.id] || expandedAlertsRef.current[alert.id]) continue;
        try {
          const details = await getAlertDetails(alert.id);
          if (!cancelled) {
            setPrefetchedDetails((prev) => ({ ...prev, [alert.id]: details }));
          }
        } catch {
          // Silently skip failed prefetches
        }
      }
    };
    fetchDetails();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  const unackedAlerts = allAlerts.filter((a) => !a.acknowledged);
  const runningCount = agents.filter((a) => a.status === "running" || a.status === "active").length;
  const aggregatedAlerts = aggregateAlerts(alerts);
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

  async function handleToggleAlertDetails(alertId: string) {
    const current = expandedAlerts[alertId];
    if (current === "loading") return; // Don't toggle while loading
    if (current) {
      // Collapse
      setExpandedAlerts((prev) => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
      setShowStackTrace((prev) => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
      return;
    }
    // Expand — use prefetched if available, otherwise fetch
    const prefetched = prefetchedDetails[alertId];
    if (prefetched) {
      setExpandedAlerts((prev) => ({ ...prev, [alertId]: prefetched }));
      return;
    }
    setExpandedAlerts((prev) => ({ ...prev, [alertId]: "loading" }));
    try {
      const details = await getAlertDetails(alertId);
      setExpandedAlerts((prev) => ({ ...prev, [alertId]: details }));
    } catch {
      // On error, show alert is expanded but with no details (don't silently collapse)
      setExpandedAlerts((prev) => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
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

      {showingDemoData && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-amber-400 text-lg">⚠️</span>
            <div>
              <span className="text-amber-400 font-medium text-sm">Demo Mode</span>
              <span className="text-amber-400/70 text-sm ml-2">Showing sample data — backend is unreachable or mock mode is enabled.</span>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2.5">
                <span className={`text-3xl font-bold ${runningCount > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>{runningCount}</span>
                <span className="text-2xl text-muted-foreground/50 font-normal">/</span>
                <span className="text-3xl font-bold">{totalAgentCount}</span>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground/60">Active / Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Spend</CardTitle>
                <button
                  onClick={() => setShowCostSettings(true)}
                  className="text-zinc-500 hover:text-emerald-400 transition-colors"
                  title="Cost settings"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${spendData?.today.toFixed(2) ?? "—"}</div>
              {spendData?.limits.type === "daily" && spendData.limits.amount ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{((spendData.today / spendData.limits.amount) * 100).toFixed(0)}%</span>
                    <span>Daily limit: ${spendData.limits.amount}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        spendData.today / spendData.limits.amount > 0.8
                          ? "bg-red-500"
                          : spendData.today / spendData.limits.amount > 0.6
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, (spendData.today / spendData.limits.amount) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : spendData && Object.keys(spendData.limits.agentLimits).length > 0 ? (
                <div className="mt-2 text-[11px] text-muted-foreground/60">Per-agent limits active</div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">MTD Spend</CardTitle>
                <button
                  onClick={() => setShowCostSettings(true)}
                  className="text-zinc-500 hover:text-emerald-400 transition-colors"
                  title="Cost settings"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${spendData?.mtd.toFixed(2) ?? "—"}</div>
              {spendData?.limits.type === "monthly" && spendData.limits.amount ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{((spendData.mtd / spendData.limits.amount) * 100).toFixed(0)}%</span>
                    <span>Monthly limit: ${spendData.limits.amount}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        spendData.mtd / spendData.limits.amount > 0.8
                          ? "bg-red-500"
                          : spendData.mtd / spendData.limits.amount > 0.6
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, (spendData.mtd / spendData.limits.amount) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : spendData && Object.keys(spendData.limits.agentLimits).length > 0 ? (
                <div className="mt-2 text-[11px] text-muted-foreground/60">Per-agent limits active</div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${spendData?.allTime?.toFixed(2) ?? totalCost.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-emerald-500/30 transition-colors"
            onClick={() => {
              setTab("agents");
              setTimeout(() => {
                document.getElementById("alerts-section")?.scrollIntoView({ behavior: "smooth" });
              }, 100);
            }}
          >
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

        {/* Cost Settings Modal */}
        {showCostSettings && spendData && (
          <CostSettingsModal
            limits={spendData.limits}
            agents={Object.keys(spendData.byAgent)}
            onSave={async (newLimits) => {
              await setCostLimits(newLimits);
              setShowCostSettings(false);
              fetchData();
            }}
            onClose={() => setShowCostSettings(false)}
          />
        )}

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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`${sc.color} border text-xs`}>
                          {sc.label}
                        </Badge>
                        {agent.overLimit && agent.limit != null && (() => {
                          const spend = agent.limitType === "daily" ? (agent.todaySpend ?? 0) : (agent.mtdSpend ?? 0);
                          const over = spend - agent.limit;
                          return (
                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 border text-xs">
                              ⚠️ ${over.toFixed(2)} over
                            </Badge>
                          );
                        })()}
                      </div>

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
                        .map((item) => {
                          const agentSpend = spendData?.byAgent[item.agentId];
                          const agentLimit = spendData?.limits.agentLimits[item.agentId];
                          const limitType = spendData?.limits.type;
                          const relevantSpend = limitType === "daily" ? agentSpend?.today : agentSpend?.mtd;
                          const isOver = agentLimit != null && relevantSpend != null && relevantSpend > agentLimit;
                          const hasLimit = agentLimit != null && agentLimit > 0;
                          // Bar: if limit exists, 100% = limit. Spend beyond = red overflow portion
                          const barPercent = hasLimit && relevantSpend != null
                            ? Math.min(100, (relevantSpend / agentLimit!) * 100)
                            : (item.costUsd / costs.totalUsd) * 100;
                          const withinPercent = hasLimit && relevantSpend != null && isOver
                            ? (agentLimit! / relevantSpend) * 100
                            : 100;
                          return (
                            <div key={item.agentId} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{item.name}</span>
                                  {isOver && (
                                    <span className="text-[10px] text-red-400 font-medium">⚠️ ${((relevantSpend ?? 0) - agentLimit!).toFixed(2)} over</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                                    {hasLimit && isOver ? (
                                      <div className="h-full flex" style={{ width: `${barPercent}%` }}>
                                        <div className="h-full bg-emerald-500" style={{ width: `${withinPercent}%` }} />
                                        <div className="h-full bg-red-500 flex-1" />
                                      </div>
                                    ) : (
                                      <div
                                        className={`h-full rounded-full ${hasLimit && relevantSpend != null && (relevantSpend / agentLimit!) > 0.8 ? "bg-amber-500" : hasLimit && relevantSpend != null && (relevantSpend / agentLimit!) > 0.6 ? "bg-amber-400" : "bg-emerald-500"}`}
                                        style={{ width: `${barPercent}%` }}
                                      />
                                    )}
                                  </div>
                                  <span className="text-sm font-medium w-24 text-right">
                                    ${item.costUsd.toFixed(2)}
                                  </span>
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
                    onClick={() => { setAlertFilter(f); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
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
                  {aggregatedAlerts.map(({ alert, count, ids }) => {
                    const sc = severityConfig[alert.severity];
                    const expanded = expandedAlerts[alert.id];
                    const isExpanded = !!expanded;
                    const isLoading = expanded === "loading";
                    const details = expanded && expanded !== "loading" ? expanded : prefetchedDetails[alert.id] || null;
                    const isStackVisible = showStackTrace[alert.id] || false;
                    const humanTitle = getHumanTitle(alert, details);
                    return (
                      <div
                        key={alert.id}
                        className={`rounded-lg overflow-hidden ${
                          alert.acknowledged ? "opacity-50" : ""
                        }`}
                      >
                        <div
                          className="flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer hover:bg-white/[0.02] transition-colors"
                          onClick={() => handleToggleAlertDetails(alert.id)}
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                            <Badge variant="outline" className={`${sc.color} border text-[10px] uppercase font-bold`}>
                              {alert.severity}
                            </Badge>
                            <span className="font-medium">{humanTitle}</span>
                            {count > 1 && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                ×{count}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(alert.timestamp)}
                            </span>
                            {!alert.acknowledged && (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  ids.forEach((id) => handleAcknowledge(id));
                                }}
                              >
                                Ack{count > 1 ? ` all` : ""}
                              </Button>
                            )}
                            {alert.acknowledged && (
                              <span className="text-xs text-muted-foreground">Acked</span>
                            )}
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
                                {/* Human-readable description */}
                                <p className="text-sm text-foreground/80 leading-relaxed">
                                  {getHumanDescription(alert, details)}
                                </p>

                                {/* Agent info */}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Agent:</span>
                                  <span className="font-medium text-foreground">{details.agent.name}</span>
                                  {count > 1 && (
                                    <span className="text-muted-foreground">· Occurred {count} times</span>
                                  )}
                                </div>

                                {/* Technical details toggle */}
                                {(details.relatedErrors.length > 0 || details.context?.stuckDurationMinutes != null || details.context?.currentCostUsd != null) && (
                                  <div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowStackTrace((prev) => ({ ...prev, [alert.id]: !prev[alert.id] }));
                                      }}
                                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <svg
                                        className={`size-3 transition-transform ${isStackVisible ? "rotate-90" : ""}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2}
                                        stroke="currentColor"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                      </svg>
                                      {isStackVisible ? "Hide technical details" : `Show technical details${details.relatedErrors.length > 0 ? ` (${details.relatedErrors.length} error${details.relatedErrors.length > 1 ? "s" : ""})` : ""}`}
                                    </button>

                                    {isStackVisible && (
                                      <div className="mt-2 pl-4 border-l-2 border-border/30 space-y-1.5">
                                        {details.context?.stuckDurationMinutes != null && (
                                          <div className="text-xs text-amber-400/80 font-mono">
                                            Stuck for {details.context.stuckDurationMinutes}m — last heartbeat {formatRelativeTime(details.context.lastHeartbeat!)}
                                          </div>
                                        )}
                                        {details.context?.currentCostUsd != null && (
                                          <div className="text-xs text-amber-400/80 font-mono">
                                            Current: ${details.context.currentCostUsd.toFixed(2)} / Threshold: ${details.context.thresholdUsd?.toFixed(2)} (+${details.context.overage?.toFixed(2)} over)
                                          </div>
                                        )}
                                        {/* Group duplicate errors */}
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
                                            {group.count > 1 && (
                                              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                                                ×{group.count}
                                              </Badge>
                                            )}
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
            {!analyticsData ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
                <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Loading analytics...
              </div>
            ) : (
              <>
                {/* Time window controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {analyticsLoading && analyticsData && (
                    <span className="size-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {(["1h", "24h", "7d", "30d", "all", "custom"] as const).map((w) => {
                    const isActive = timeWindow === w && !zoomRange;
                    return (
                      <button
                        key={w}
                        onClick={() => { setTimeWindowParam(w); resetZoom(); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                        }`}
                      >
                        {w === "custom" ? "Custom" : w === "all" ? "All time" : w === "1h" ? "Last hour" : w === "24h" ? "Last 24h" : w === "7d" ? "Last 7d" : "Last 30d"}
                      </button>
                    );
                  })}
                  {timeWindow === "custom" && (
                    <div className="flex items-center gap-2 ml-2">
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomDates(e.target.value, customTo)}
                        className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 focus:border-emerald-500/50 focus:outline-none"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomDates(customFrom, e.target.value)}
                        className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Summary stats */}
                {(() => {
                  const statBuckets = zoomRange ? zoomedBuckets : analyticsData.buckets;
                  const totalCostPeriod = statBuckets.reduce((s, b) => s + b.costUsd, 0);
                  const totalTokens = statBuckets.reduce((s, b) => s + b.tokenCount, 0);
                  const totalSessions = statBuckets.reduce((s, b) => s + b.sessionCount, 0);
                  const avgDailyCost = statBuckets.length > 0 ? totalCostPeriod / statBuckets.length : 0;
                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Period Cost</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">${totalCostPeriod.toFixed(2)}</div>
                          <div className="text-[11px] text-muted-foreground/60 mt-1">
                            {activeLabel}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">{formatTokens(totalTokens)}</div>
                          <div className="text-[11px] text-muted-foreground/60 mt-1">{activeLabel}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">{totalSessions}</div>
                          <div className="text-[11px] text-muted-foreground/60 mt-1">{activeLabel}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            {effectiveGroupBy === "hour" ? "Avg Hourly Cost" : "Avg Daily Cost"}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">${avgDailyCost.toFixed(2)}</div>
                          <div className="text-[11px] text-muted-foreground/60 mt-1">
                            {activeLabel}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}

                {/* Total usage over time */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-semibold">Total Usage Over Time</CardTitle>
                    <div className="flex items-center gap-2">
                      {!zoomRange && (
                        <span className="text-[11px] text-muted-foreground/50">Click &amp; drag to zoom</span>
                      )}
                      {zoomRange && (
                        <>
                          {zoomFetching && (
                            <span className="size-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          )}
                          <span className="text-xs text-emerald-400/80 font-medium">
                            {(() => {
                              const fmt = (d: string) => {
                                const date = parseChartDate(d);
                                const leftDate = parseChartDate(zoomRange.left);
                                const rightDate = parseChartDate(zoomRange.right);
                                const rangeDays = (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000);
                                if (rangeDays <= 3) {
                                  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
                                }
                                return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                              };
                              return `${fmt(zoomRange.left)} — ${fmt(zoomRange.right)}`;
                            })()}
                          </span>
                          <button
                            onClick={resetZoom}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
                          >
                            ↩ Reset zoom
                          </button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]" style={{ cursor: isDragging ? "col-resize" : "crosshair", userSelect: isDragging ? "none" : "auto" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={zoomedBuckets}
                          onMouseDown={handleZoomMouseDown}
                          onMouseMove={handleZoomMouseMove}
                          onMouseUp={handleZoomMouseUp}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => zoomChartDateFormatter(String(d))} />
                          <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 10 ? 2 : 0)}`} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const bucket = zoomedBuckets.find((b) => b.date === label);
                              const dateStr = formatTooltipDate(String(label));
                              const cost = bucket?.costUsd?.toFixed(2) ?? "0";
                              const tokens = formatTokens(bucket?.tokenCount ?? 0);
                              const sess = bucket?.sessionCount ?? 0;
                              return (
                                <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px" }}>
                                  <div style={{ color: "#a1a1aa", marginBottom: 4, fontSize: 12 }}>{dateStr}</div>
                                  <div style={{ color: "#e4e4e7", fontSize: 13 }}>{"Cost: $"}{cost}</div>
                                  <div style={{ color: "#a1a1aa", fontSize: 12 }}>{"Tokens: "}{tokens}</div>
                                  <div style={{ color: "#a1a1aa", fontSize: 12 }}>{"Sessions: "}{sess}</div>
                                </div>
                              );
                            }}
                          />
                          <Area type="monotone" dataKey="costUsd" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
                          {spendData?.limits?.amount && (
                            <ReferenceLine
                              y={spendData.limits.amount}
                              stroke="#ef4444"
                              strokeDasharray="6 3"
                              label={{ value: `Limit: $${spendData.limits.amount}`, position: "insideTopRight", fill: "#ef4444", fontSize: 11 }}
                            />
                          )}
                          {zoomLeft && zoomRight && (
                            <ReferenceArea x1={zoomLeft} x2={zoomRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.15} />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Usage by Project — moved under Total per Gal's request */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Usage by Project</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]" style={{ cursor: isDragging ? "col-resize" : "crosshair", userSelect: isDragging ? "none" : "auto" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        {(() => {
                          const projectColors = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];
                          const dates = zoomedBuckets.map((b) => b.date);
                          const merged = dates.map((date) => {
                            const row: Record<string, string | number> = { date };
                            for (const proj of zoomedByProject) {
                              const bucket = proj.buckets.find((b) => b.date === date);
                              row[proj.name] = bucket?.costUsd ?? 0;
                            }
                            return row;
                          });
                          return (
                            <AreaChart
                              data={merged}
                              onMouseDown={handleZoomMouseDown}
                              onMouseMove={handleZoomMouseMove}
                              onMouseUp={handleZoomMouseUp}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => zoomChartDateFormatter(String(d))} />
                              <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 10 ? 2 : 0)}`} />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const visible = payload.filter((p) => !hiddenProjectSeries.has(String(p.dataKey)));
                                  if (!visible.length) return null;
                                  return (
                                    <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px" }}>
                                      <div style={{ color: "#a1a1aa", marginBottom: 4, fontSize: 12 }}>{formatTooltipDate(String(label))}</div>
                                      {visible.map((entry) => (
                                        <div key={String(entry.dataKey)} style={{ color: String(entry.color), fontSize: 12 }}>
                                          {String(entry.dataKey)}: {"$"}{Number(entry.value).toFixed(2)}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }}
                              />
                              <Legend
                                wrapperStyle={{ color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}
                                onClick={(e, _idx, event) => {
                                  const key = String(e.dataKey);
                                  const allKeys = analyticsData!.byProject.map((p) => p.name);
                                  const nativeEvent = (event as unknown as React.MouseEvent)?.nativeEvent ?? event;
                                  const isMulti = (nativeEvent as MouseEvent)?.metaKey || (nativeEvent as MouseEvent)?.ctrlKey;
                                  setHiddenProjectSeries((prev) => {
                                    if (isMulti) {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key); else next.add(key);
                                      return next;
                                    }
                                    // Single click: if this is the only visible one, show all; otherwise solo it
                                    const visible = allKeys.filter((k) => !prev.has(k));
                                    if (visible.length === 1 && visible[0] === key) return new Set();
                                    return new Set(allKeys.filter((k) => k !== key));
                                  });
                                }}
                                formatter={(value) => (
                                  <span style={{ color: hiddenProjectSeries.has(String(value)) ? "#52525b" : "#a1a1aa", textDecoration: hiddenProjectSeries.has(String(value)) ? "line-through" : "none" }}>{String(value)}</span>
                                )}
                              />
                              {analyticsData.byProject.map((proj, i) => {
                                const color = projectColors[i % projectColors.length];
                                const hidden = hiddenProjectSeries.has(proj.name);
                                return (
                                  <Area key={proj.projectId} type="monotone" dataKey={proj.name} stroke={hidden ? "transparent" : color} fill={hidden ? "transparent" : color} fillOpacity={hidden ? 0 : 0.15} strokeWidth={2} />
                                );
                              })}
                              {zoomLeft && zoomRight && (
                                <ReferenceArea x1={zoomLeft} x2={zoomRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.15} />
                              )}
                            </AreaChart>
                          );
                        })()}
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
                    <div className="h-[300px]" style={{ cursor: isDragging ? "col-resize" : "crosshair", userSelect: isDragging ? "none" : "auto" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        {(() => {
                          const agentChartColors: Record<string, string> = {
                            ofek: "#3b82f6",
                            anas: "#a855f7",
                            dor: "#14b8a6",
                          };
                          const defaultColors = ["#6366f1", "#ec4899", "#f59e0b", "#84cc16", "#06b6d4"];
                          const dates = zoomedBuckets.map((b) => b.date);
                          const merged = dates.map((date) => {
                            const row: Record<string, string | number> = { date };
                            for (const agent of zoomedByAgent) {
                              const bucket = agent.buckets.find((b) => b.date === date);
                              row[agent.agentId] = bucket?.costUsd ?? 0;
                            }
                            return row;
                          });
                          return (
                            <AreaChart
                              data={merged}
                              onMouseDown={handleZoomMouseDown}
                              onMouseMove={handleZoomMouseMove}
                              onMouseUp={handleZoomMouseUp}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => zoomChartDateFormatter(String(d))} />
                              <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 10 ? 2 : 0)}`} />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const visible = payload.filter((p) => !hiddenAgentSeries.has(String(p.dataKey)));
                                  if (!visible.length) return null;
                                  return (
                                    <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px" }}>
                                      <div style={{ color: "#a1a1aa", marginBottom: 4, fontSize: 12 }}>{formatTooltipDate(String(label))}</div>
                                      {visible.map((entry) => (
                                        <div key={String(entry.dataKey)} style={{ color: String(entry.color), fontSize: 12 }}>
                                          {String(entry.dataKey)}: {"$"}{Number(entry.value).toFixed(2)}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }}
                              />
                              <Legend
                                wrapperStyle={{ color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}
                                onClick={(e, _idx, event) => {
                                  const key = String(e.dataKey);
                                  const allKeys = analyticsData!.byAgent.map((a) => a.agentId);
                                  const nativeEvent = (event as unknown as React.MouseEvent)?.nativeEvent ?? event;
                                  const isMulti = (nativeEvent as MouseEvent)?.metaKey || (nativeEvent as MouseEvent)?.ctrlKey;
                                  setHiddenAgentSeries((prev) => {
                                    if (isMulti) {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key); else next.add(key);
                                      return next;
                                    }
                                    const visible = allKeys.filter((k) => !prev.has(k));
                                    if (visible.length === 1 && visible[0] === key) return new Set();
                                    return new Set(allKeys.filter((k) => k !== key));
                                  });
                                }}
                                formatter={(value) => (
                                  <span style={{ color: hiddenAgentSeries.has(String(value)) ? "#52525b" : "#a1a1aa", textDecoration: hiddenAgentSeries.has(String(value)) ? "line-through" : "none" }}>{String(value)}</span>
                                )}
                              />
                              {analyticsData.byAgent.map((agent, i) => {
                                const color = agentChartColors[agent.agentId] || defaultColors[i % defaultColors.length];
                                const hidden = hiddenAgentSeries.has(agent.agentId);
                                return (
                                  <Area key={agent.agentId} type="monotone" dataKey={agent.agentId} stroke={hidden ? "transparent" : color} fill={hidden ? "transparent" : color} fillOpacity={hidden ? 0 : 0.15} strokeWidth={2} />
                                );
                              })}
                              {zoomLeft && zoomRight && (
                                <ReferenceArea x1={zoomLeft} x2={zoomRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.15} />
                              )}
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
