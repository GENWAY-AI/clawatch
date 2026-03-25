"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent, Alert, AlertDetails, CostData, AgentStatus, AlertSeverity, Session, Project, Profile, AnalyticsData, SpendData, CostLimits, BulkRecommendationSummary } from "@/lib/types";
import { getAgents, getAlerts, getAlertDetails, getCosts, pauseAgent, resumeAgent, acknowledgeAlert, acknowledgeAllAlerts, getSessions, getProjects, getProfiles, getVersion, getAnalytics, getSpend, setCostLimits, isUsingMockData, getRecommendationSummary } from "@/lib/api";
import { ClaWatchLogo, ClaWatchIcon } from "@/components/clawatch-logo";
import { AgentsTab } from "./components/AgentsTab";
import { SessionsTab } from "./components/SessionsTab";
import { AnalyticsTab } from "./components/AnalyticsTab";
import { ProjectsTab } from "./components/ProjectsTab";
import { RecommendationsTab } from "./components/RecommendationsTab";

// --- Helpers ---
function parseChartDate(d: string): Date {
  const s = String(d);
  if (s.includes("T") && !s.endsWith("Z")) return new Date(s + ":00Z");
  if (!s.includes("T")) return new Date(s + "T00:00:00Z");
  return new Date(s);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// --- Types ---
type Tab = "agents" | "sessions" | "projects" | "analytics" | "recommendations";
type SessionFilter = "all" | "active" | "idle" | "completed";
type SessionSort = "recent" | "cost" | "tokens";
type AlertFilter = "all" | "critical" | "warning" | "info";
type TimeWindow = "1h" | "24h" | "7d" | "30d" | "all" | "custom";

const ALERTS_PER_PAGE = 5;
const SESSIONS_PER_PAGE = 10;

// --- Cost Settings Modal ---
function CostSettingsModal({ limits, agents, onSave, onClose }: {
  limits: CostLimits; agents: string[];
  onSave: (limits: CostLimits) => Promise<void>; onClose: () => void;
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
                <button key={label} onClick={() => setLimitType(val)} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${limitType === val ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}>{label}</button>
              ))}
            </div>
          </div>
          {limitType && (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{limitType === 'daily' ? 'Daily' : 'Monthly'} Limit ($)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-emerald-500/50" placeholder="e.g. 50" />
            </div>
          )}
          {limitType && agents.length > 0 && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Per-Agent Overrides</label>
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div key={agent} className="grid grid-cols-[140px_1fr] items-center gap-3">
                    <span className="text-sm text-zinc-300 truncate" title={agent}>{agent}</span>
                    <input type="number" min="0" step="0.01" value={agentLimits[agent] ?? ""} onChange={(e) => setAgentLimits((prev) => ({ ...prev, [agent]: e.target.value }))} className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-emerald-500/50" placeholder="No override" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">Cancel</button>
          <button disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              const parsedAgentLimits: Record<string, number> = {};
              for (const [k, v] of Object.entries(agentLimits)) { const n = parseFloat(v); if (!isNaN(n) && n > 0) parsedAgentLimits[k] = n; }
              await onSave({ type: limitType, amount: limitType ? (parseFloat(amount) || null) : null, agentLimits: parsedAgentLimits });
            } finally { setSaving(false); }
          }} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---
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

  // --- Tab state ---
  const tabParam = searchParams.get("tab") as Tab | null;
  const [tab, setTabRaw] = useState<Tab>(tabParam && ["agents", "sessions", "projects", "analytics", "recommendations"].includes(tabParam) ? tabParam : "agents");
  function setTab(t: Tab) {
    setTabRaw(t);
    const params = new URLSearchParams(searchParams.toString());
    if (t === "agents") params.delete("tab"); else params.set("tab", t);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // --- Core state ---
  const [agents, setAgents] = useState<Agent[]>([]);
  const [totalAgentCount, setTotalAgentCount] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [showIdleAgents, setShowIdleAgents] = useState(false);
  const [recommendationsSummary, setRecommendationsSummary] = useState<BulkRecommendationSummary | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  // --- Session/Alert filter state ---
  const sessionFilterParam = searchParams.get("sessionFilter") as SessionFilter | null;
  const sessionSortParam = searchParams.get("sessionSort") as SessionSort | null;
  const [sessionFilter, setSessionFilterRaw] = useState<SessionFilter>(
    sessionFilterParam && ["all", "active", "idle", "completed"].includes(sessionFilterParam) ? sessionFilterParam : "active"
  );
  const [sessionSort, setSessionSortRaw] = useState<SessionSort>(
    sessionSortParam && ["recent", "cost", "tokens"].includes(sessionSortParam) ? sessionSortParam : "recent"
  );
  const alertFilter = (searchParams.get("alertSeverity") as AlertFilter) || "all";
  const alertPage = Math.max(1, parseInt(searchParams.get("alertPage") || "1", 10));
  const sessionPage = Math.max(1, parseInt(searchParams.get("sessionPage") || "1", 10));

  // --- Chart zoom state ---
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);
  const zoomFromParam = searchParams.get("zoomFrom");
  const zoomToParam = searchParams.get("zoomTo");
  const zoomRange = zoomFromParam && zoomToParam ? { left: zoomFromParam, right: zoomToParam } : null;
  const [zoomedAnalytics, setZoomedAnalytics] = useState<AnalyticsData | null>(null);
  const [zoomFetching, setZoomFetching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const prevZoomRange = useRef<{ left: string; right: string } | null>(null);

  // --- Analytics state ---
  const selectedProfile = searchParams.get("profile") || "default";
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
    const toISO = (d: Date) => d.toISOString().slice(0, 16) + "Z";
    switch (w) {
      case "1h": { const from = new Date(now.getTime() - 60 * 60 * 1000); return { from: toISO(from), to: toISO(now) }; }
      case "24h": { const from = new Date(now.getTime() - 24 * 60 * 60 * 1000); return { from: toISO(from), to: toISO(now) }; }
      case "7d": { const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); return { from: toISO(from), to: toISO(now) }; }
      case "30d": { const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); return { from: toISO(from), to: toISO(now) }; }
      case "all": return {};
      case "custom": return { from: customFrom || undefined, to: customTo || undefined };
    }
  }

  const analyticsGroupBy: "hour" | "day" = timeWindow === "custom" ? "day" : (timeWindowConfig[timeWindow]?.groupBy ?? "day");
  const periodLabel = timeWindow === "custom"
    ? (customFrom && customTo ? `${customFrom} – ${customTo}` : "Custom range")
    : (timeWindowConfig[timeWindow]?.periodLabel ?? "Last 7 days");

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

  // Zoomed data filtering
  const zoomSource = zoomedAnalytics || analyticsData;
  const inZoomRange = (date: string) => {
    if (!zoomRange) return true;
    const t = parseChartDate(date).getTime();
    const left = parseChartDate(zoomRange.left).getTime();
    let right = parseChartDate(zoomRange.right).getTime();
    if (!zoomRange.right.includes("T")) right += 24 * 60 * 60 * 1000 - 1;
    return t >= left && t <= right;
  };

  const zoomedBuckets = zoomRange && zoomSource
    ? (zoomedAnalytics ? zoomedAnalytics.buckets.filter((b) => inZoomRange(b.date)) : zoomSource.buckets.filter((b) => inZoomRange(b.date)))
    : analyticsData?.buckets ?? [];
  const zoomedByProject = zoomRange && zoomSource
    ? (zoomedAnalytics ? zoomedAnalytics.byProject : analyticsData!.byProject).map((proj) => ({ ...proj, buckets: proj.buckets.filter((b) => inZoomRange(b.date)) }))
    : analyticsData?.byProject ?? [];
  const zoomedByAgent = zoomRange && zoomSource
    ? (zoomedAnalytics ? zoomedAnalytics.byAgent : analyticsData!.byAgent).map((agent) => ({ ...agent, buckets: agent.buckets.filter((b) => inZoomRange(b.date)) }))
    : analyticsData?.byAgent ?? [];

  const effectiveGroupBy = zoomedAnalytics ? "hour" : analyticsGroupBy;

  // --- URL param helpers ---
  const setZoomParams = (left: string, right: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("zoomFrom", left); params.set("zoomTo", right);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const clearZoomParams = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("zoomFrom"); params.delete("zoomTo");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleZoomMouseDown = (e: Record<string, unknown>) => {
    if (showingDemoData) return;
    if (e?.activeLabel) { setZoomLeft(String(e.activeLabel)); setIsDragging(true); }
  };
  const handleZoomMouseMove = (e: Record<string, unknown>) => {
    if (zoomLeft && e?.activeLabel) setZoomRight(String(e.activeLabel));
  };
  const handleZoomMouseUp = () => {
    setIsDragging(false);
    if (zoomLeft && zoomRight && zoomLeft !== zoomRight) {
      const [left, right] = [zoomLeft, zoomRight].sort();
      setZoomParams(left, right);
    }
    setZoomLeft(null); setZoomRight(null);
  };
  const resetZoom = () => {
    clearZoomParams(); setZoomLeft(null); setZoomRight(null);
    setZoomedAnalytics(null); prevZoomRange.current = null;
  };
  const clearZoomState = () => {
    setZoomLeft(null); setZoomRight(null);
    setZoomedAnalytics(null); prevZoomRange.current = null;
  };

  function setAlertFilter(filter: AlertFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") params.delete("alertSeverity"); else params.set("alertSeverity", filter);
    params.delete("alertPage");
    setExpandedAlerts({}); setShowStackTrace({});
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setAlertPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("alertPage"); else params.set("alertPage", String(page));
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setSessionFilter(f: SessionFilter) {
    setSessionFilterRaw(f);
    const params = new URLSearchParams(searchParams.toString());
    if (f === "active") params.delete("sessionFilter"); else params.set("sessionFilter", f);
    params.delete("sessionPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setSessionSort(s: SessionSort) {
    setSessionSortRaw(s);
    const params = new URLSearchParams(searchParams.toString());
    if (s === "recent") params.delete("sessionSort"); else params.set("sessionSort", s);
    params.delete("sessionPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setSessionPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("sessionPage"); else params.set("sessionPage", String(page));
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setSelectedProfile(profileId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", profileId || "default");
    params.delete("alertPage"); params.delete("sessionPage");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setTimeWindowParam(w: TimeWindow) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("groupBy"); params.delete("zoomFrom"); params.delete("zoomTo");
    if (w === "7d") params.delete("window"); else params.set("window", w);
    if (w !== "custom") { params.delete("from"); params.delete("to"); }
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  function setCustomDates(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", "custom"); params.delete("groupBy");
    if (from) params.set("from", from); else params.delete("from");
    if (to) params.set("to", to); else params.delete("to");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // --- Data fetching ---
  useEffect(() => {
    if (tab !== "analytics") return;
    let cancelled = false;
    setAnalyticsLoading(true);
    const { from, to } = getWindowDates(timeWindow);
    const fetches: Promise<void>[] = [
      getAnalytics({ profile: selectedProfile, groupBy: analyticsGroupBy, from, to }).then((data) => { if (!cancelled) setAnalyticsData(data); }),
    ];
    if (timeWindow !== "all") {
      fetches.push(getAnalytics({ profile: selectedProfile, groupBy: "day" }).then((allTime) => {
        if (!cancelled) {
          const totalTokens = allTime.buckets.reduce((s, b) => s + b.tokenCount, 0);
          const totalSessions = allTime.buckets.reduce((s, b) => s + b.sessionCount, 0);
          setAnalyticsAllTime({ totalTokens, totalSessions });
        }
      }));
    } else { setAnalyticsAllTime(null); }
    Promise.all(fetches).catch(() => {}).finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedProfile, timeWindow, customFrom, customTo]);

  useEffect(() => {
    if (tab !== "recommendations") return;
    let cancelled = false;
    setRecommendationsLoading(true);
    getRecommendationSummary(selectedProfile, 20)
      .then((data) => { if (!cancelled) setRecommendationsSummary(data); })
      .catch(() => { if (!cancelled) setRecommendationsSummary(null); })
      .finally(() => { if (!cancelled) setRecommendationsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, selectedProfile]);

  useEffect(() => {
    if (!zoomRange || !analyticsData) { setZoomedAnalytics(null); prevZoomRange.current = null; return; }
    if (zoomedAnalytics && prevZoomRange.current) { prevZoomRange.current = zoomRange; return; }
    if (analyticsGroupBy === "day") {
      let cancelled = false;
      setZoomFetching(true);
      const fetchLeft = zoomRange.left.includes("T") ? zoomRange.left.split("T")[0] : zoomRange.left;
      const fetchRightDate = new Date(parseChartDate(zoomRange.right).getTime() + 24 * 60 * 60 * 1000);
      const fetchRight = fetchRightDate.toISOString().slice(0, 10);
      getAnalytics({ profile: selectedProfile, groupBy: "hour", from: fetchLeft, to: fetchRight }).then((data) => {
        if (!cancelled) { setZoomedAnalytics(data); prevZoomRange.current = zoomRange; }
      }).catch(() => {}).finally(() => { if (!cancelled) setZoomFetching(false); });
      return () => { cancelled = true; };
    } else { setZoomedAnalytics(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomFromParam, zoomToParam, selectedProfile, analyticsData]);

  useEffect(() => {
    Promise.all([getProfiles(), getVersion()]).then(([p, v]) => { setProfiles(p); setVersion(v); });
  }, []);

  // Auto-fetch alert details
  useEffect(() => {
    if (alerts.length === 0) return;
    let cancelled = false;
    const fetchDetails = async () => {
      for (const alert of alerts) {
        if (cancelled) break;
        if (prefetchedDetails[alert.id] || expandedAlertsRef.current[alert.id]) continue;
        try {
          const details = await getAlertDetails(alert.id);
          if (!cancelled) setPrefetchedDetails((prev) => ({ ...prev, [alert.id]: details }));
        } catch {}
      }
    };
    fetchDetails();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  const fetchData = useCallback(async () => {
    try {
      const agentStatus = showIdleAgents ? "all" : undefined;
      const sessStatus = sessionFilter === "all" ? "all" : sessionFilter === "active" ? undefined : sessionFilter;
      const severityParam = alertFilter !== "all" ? (alertFilter as AlertSeverity) : undefined;
      const alertOffset = (alertPage - 1) * ALERTS_PER_PAGE;
      const sessionOffset = (sessionPage - 1) * SESSIONS_PER_PAGE;
      const prof = selectedProfile;
      const [a, allAgents, al, allAl, c, sessResult, p, sp] = await Promise.all([
        getAgents(agentStatus, prof), getAgents("all", prof),
        getAlerts({ limit: ALERTS_PER_PAGE, offset: alertOffset, severity: severityParam, profile: prof }),
        getAlerts({ profile: prof }), getCosts({ profile: prof }),
        getSessions({ status: sessStatus, sort: sessionSort, profile: prof, limit: SESSIONS_PER_PAGE, offset: sessionOffset }),
        getProjects(prof), getSpend(prof),
      ]);
      setAgents(a); setTotalAgentCount(allAgents.length);
      setAlerts(al.alerts ?? al); setAlertsTotal(al.total ?? 0);
      setAllAlerts(allAl.alerts ?? allAl); setCosts(c);
      setSessions(sessResult.sessions); setSessionsTotal(sessResult.total);
      setProjects(p); setSpendData(sp);
      setShowingDemoData(isUsingMockData());
    } finally { setLoading(false); }
  }, [showIdleAgents, sessionFilter, sessionSort, alertFilter, alertPage, sessionPage, selectedProfile]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- Handlers ---
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
    const prevAlerts = alerts; const prevAllAlerts = allAlerts;
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
    setAllAlerts((prev) => prev.map((a) => !severityParam || a.severity === severityParam ? { ...a, acknowledged: true } : a));
    try { await acknowledgeAllAlerts(severityParam); } catch { setAlerts(prevAlerts); setAllAlerts(prevAllAlerts); } finally { setAckAllLoading(false); }
  }
  async function handleToggleAlertDetails(alertId: string) {
    const current = expandedAlerts[alertId];
    if (current === "loading") return;
    if (current) {
      setExpandedAlerts((prev) => { const next = { ...prev }; delete next[alertId]; return next; });
      setShowStackTrace((prev) => { const next = { ...prev }; delete next[alertId]; return next; });
      return;
    }
    const prefetched = prefetchedDetails[alertId];
    if (prefetched) { setExpandedAlerts((prev) => ({ ...prev, [alertId]: prefetched })); return; }
    setExpandedAlerts((prev) => ({ ...prev, [alertId]: "loading" }));
    try { const details = await getAlertDetails(alertId); setExpandedAlerts((prev) => ({ ...prev, [alertId]: details })); }
    catch { setExpandedAlerts((prev) => { const next = { ...prev }; delete next[alertId]; return next; }); }
  }

  // --- Computed ---
  const unackedAlerts = allAlerts.filter((a) => !a.acknowledged);
  const runningCount = agents.filter((a) => a.status === "running" || a.status === "active").length;
  const totalCost = costs?.totalUsd ?? 0;

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

  // --- Render ---
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2"><ClaWatchIcon /><ClaWatchLogo size="md" /></Link>
            <span className="text-sm text-muted-foreground">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            {profiles.length > 0 && (
              <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)} className="bg-zinc-900 border border-border/50 rounded-md px-2.5 py-1 text-xs text-muted-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer appearance-none pr-6" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</div>
            {version && <span className="text-[10px] text-muted-foreground/60">v{version}</span>}
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
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Agents</CardTitle></CardHeader>
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
                <button onClick={() => setShowCostSettings(true)} className="text-zinc-500 hover:text-emerald-400 transition-colors" title="Cost settings">
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
                    <div className={`h-full rounded-full transition-all ${spendData.today / spendData.limits.amount > 0.8 ? "bg-red-500" : spendData.today / spendData.limits.amount > 0.6 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (spendData.today / spendData.limits.amount) * 100)}%` }} />
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
                <button onClick={() => setShowCostSettings(true)} className="text-zinc-500 hover:text-emerald-400 transition-colors" title="Cost settings">
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
                    <div className={`h-full rounded-full transition-all ${spendData.mtd / spendData.limits.amount > 0.8 ? "bg-red-500" : spendData.mtd / spendData.limits.amount > 0.6 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (spendData.mtd / spendData.limits.amount) * 100)}%` }} />
                  </div>
                </div>
              ) : spendData && Object.keys(spendData.limits.agentLimits).length > 0 ? (
                <div className="mt-2 text-[11px] text-muted-foreground/60">Per-agent limits active</div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">${spendData?.allTime?.toFixed(2) ?? totalCost.toFixed(2)}</div></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-emerald-500/30 transition-colors" onClick={() => { setTab("agents"); setTimeout(() => { document.getElementById("alerts-section")?.scrollIntoView({ behavior: "smooth" }); }, 100); }}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Alerts</CardTitle></CardHeader>
            <CardContent><div className={`text-3xl font-bold ${unackedAlerts.length > 0 ? "text-red-400" : "text-emerald-400"}`}>{unackedAlerts.length}</div></CardContent>
          </Card>
        </div>

        {showCostSettings && spendData && (
          <CostSettingsModal limits={spendData.limits} agents={Object.keys(spendData.byAgent)} onSave={async (newLimits) => { await setCostLimits(newLimits); setShowCostSettings(false); fetchData(); }} onClose={() => setShowCostSettings(false)} />
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border/50 overflow-x-auto">
          {([
            { key: "agents" as Tab, label: "Active Agents", count: agents.length },
            { key: "sessions" as Tab, label: "Sessions", count: sessionsTotal || sessions.length },
            { key: "projects" as Tab, label: "Projects", count: projects.length },
            { key: "analytics" as Tab, label: "Analytics", count: null },
            { key: "recommendations" as Tab, label: "Recommendations", count: recommendationsSummary?.recommendations.length ?? null, badge: recommendationsSummary && recommendationsSummary.potentialTotalSavings > 0 },
          ]).map(({ key, label, count, badge }) => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
              {count !== null && <Badge variant="outline" className={`ml-2 text-[10px] px-1.5 py-0 ${badge ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}`}>{count}</Badge>}
              {tab === key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "agents" && (
          <AgentsTab
            agents={agents} alerts={alerts} alertsTotal={alertsTotal} costs={costs} spendData={spendData}
            showIdleAgents={showIdleAgents} setShowIdleAgents={setShowIdleAgents}
            alertFilter={alertFilter} setAlertFilter={setAlertFilter} alertPage={alertPage} setAlertPage={setAlertPage}
            onPauseResume={handlePauseResume} onAcknowledge={handleAcknowledge} onAcknowledgeAll={handleAcknowledgeAll} ackAllLoading={ackAllLoading}
            onToggleAlertDetails={handleToggleAlertDetails} expandedAlerts={expandedAlerts} prefetchedDetails={prefetchedDetails}
            showStackTrace={showStackTrace} setShowStackTrace={setShowStackTrace}
          />
        )}
        {tab === "sessions" && (
          <SessionsTab
            sessions={sessions} sessionsTotal={sessionsTotal} projects={projects}
            sessionFilter={sessionFilter} setSessionFilter={setSessionFilter}
            sessionSort={sessionSort} setSessionSort={setSessionSort}
            sessionPage={sessionPage} setSessionPage={setSessionPage}
            setSessions={setSessions}
          />
        )}
        {tab === "analytics" && (
          <AnalyticsTab
            analyticsData={analyticsData} analyticsLoading={analyticsLoading} showingDemoData={showingDemoData} spendData={spendData}
            timeWindow={timeWindow} setTimeWindowParam={setTimeWindowParam} customFrom={customFrom} customTo={customTo} setCustomDates={setCustomDates}
            zoomRange={zoomRange} zoomLeft={zoomLeft} zoomRight={zoomRight} zoomFetching={zoomFetching} isDragging={isDragging}
            handleZoomMouseDown={handleZoomMouseDown} handleZoomMouseMove={handleZoomMouseMove} handleZoomMouseUp={handleZoomMouseUp} resetZoom={resetZoom}
            zoomedBuckets={zoomedBuckets} zoomedByProject={zoomedByProject} zoomedByAgent={zoomedByAgent}
            effectiveGroupBy={effectiveGroupBy} activeLabel={activeLabel}
            hiddenAgentSeries={hiddenAgentSeries} setHiddenAgentSeries={setHiddenAgentSeries}
            hiddenProjectSeries={hiddenProjectSeries} setHiddenProjectSeries={setHiddenProjectSeries}
            clearZoomState={clearZoomState}
          />
        )}
        {tab === "projects" && (
          <ProjectsTab projects={projects} setProjects={setProjects} />
        )}
        {tab === "recommendations" && (
          <RecommendationsTab
            summary={recommendationsSummary}
            loading={recommendationsLoading}
          />
        )}
      </div>
    </div>
  );
}
