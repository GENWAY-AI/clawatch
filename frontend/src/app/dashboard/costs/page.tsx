"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CostData, Profile } from "@/lib/types";
import { getCosts, getCostsCSVUrl, getProfiles } from "@/lib/api";
import { ClaWatchLogo, ClaWatchIcon } from "@/components/clawatch-logo";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

type DatePreset = "7d" | "30d" | "month" | "all";

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (preset === "7d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (preset === "30d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (preset === "month") {
    const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to };
  }
  return { from: "", to: "" };
}

const AGENT_COLORS = ["#3b82f6", "#a855f7", "#14b8a6", "#f59e0b", "#ef4444"];
const PIE_COLORS = ["#10b981", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899"];

export default function CostsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading costs...
          </div>
        </div>
      }
    >
      <CostsContent />
    </Suspense>
  );
}

function CostsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedProfile = searchParams.get("profile") || "default";
  const preset = (searchParams.get("preset") as DatePreset) || "30d";
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";

  // Compute effective from/to from preset or custom params
  const effectiveDates = fromParam && toParam
    ? { from: fromParam, to: toParam }
    : getPresetDates(preset);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "default") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setPreset(p: DatePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    if (p === "30d") {
      params.delete("preset");
    } else {
      params.set("preset", p);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function setCustomDate(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("preset");
    params.set(key, value);
    // Ensure both from and to exist
    if (key === "from" && !params.get("to")) {
      params.set("to", new Date().toISOString().slice(0, 10));
    }
    if (key === "to" && !params.get("from")) {
      params.set("from", "2020-01-01");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    getProfiles().then(setProfiles);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCosts({
        profile: selectedProfile,
        from: effectiveDates.from || undefined,
        to: effectiveDates.to || undefined,
      });
      setCosts(data);
    } finally {
      setLoading(false);
    }
  }, [selectedProfile, effectiveDates.from, effectiveDates.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalCost = costs?.totalUsd ?? 0;
  const totalTokens = costs?.totalTokens ?? 0;
  const sessionCount = costs?.sessionCount ?? 0;
  const avgCostPerSession = sessionCount > 0 ? totalCost / sessionCount : 0;

  // Sort daily data descending for the table
  const dailySorted = [...(costs?.daily ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  // Ascending for the chart
  const dailyChartData = [...(costs?.daily ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const maxAgentCost = Math.max(...(costs?.byAgent ?? []).map((a) => a.costUsd), 0);
  const maxProjectCost = Math.max(...(costs?.byProject ?? []).map((p) => p.costUsd), 0);

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
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm text-foreground font-medium">Costs</span>
          </div>
          <div className="flex items-center gap-4">
            {profiles.length > 0 && (
              <select
                value={selectedProfile}
                onChange={(e) => setParam("profile", e.target.value)}
                className="bg-zinc-900 border border-border/50 rounded-md px-2.5 py-1 text-xs text-muted-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer appearance-none pr-6"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 6px center",
                }}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <a
              href={getCostsCSVUrl(selectedProfile !== "default" ? selectedProfile : undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {(
              [
                ["7d", "Last 7 days"],
                ["30d", "Last 30 days"],
                ["month", "This month"],
                ["all", "All time"],
              ] as [DatePreset, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPreset(value)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  preset === value && !fromParam
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={fromParam || effectiveDates.from}
              onChange={(e) => setCustomDate("from", e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-emerald-500/50"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={toParam || effectiveDates.to}
              onChange={(e) => setCustomDate("to", e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Loading costs...
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <div className="text-3xl font-bold">{sessionCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Cost/Session</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">${avgCostPerSession.toFixed(2)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily Cost Trend */}
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Daily Cost Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyChartData}>
                        <defs>
                          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#71717a", fontSize: 11 }}
                          tickFormatter={(d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        />
                        <YAxis
                          tick={{ fill: "#71717a", fontSize: 11 }}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
                          labelFormatter={(d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="costUsd"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#costGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cost by Agent — Horizontal Bar */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cost by Agent</CardTitle>
                </CardHeader>
                <CardContent>
                  {(costs?.byAgent ?? []).length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={costs!.byAgent}
                          layout="vertical"
                          margin={{ left: 60, right: 20, top: 5, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fill: "#71717a", fontSize: 11 }}
                            tickFormatter={(v) => `$${v}`}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fill: "#71717a", fontSize: 11 }}
                            width={55}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                          />
                          <Bar dataKey="costUsd" radius={[0, 4, 4, 0]}>
                            {(costs?.byAgent ?? []).map((_, i) => (
                              <Cell key={i} fill={AGENT_COLORS[i % AGENT_COLORS.length]} style={{ stroke: "none" }} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No agent data</div>
                  )}
                </CardContent>
              </Card>

              {/* Cost by Model — Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cost by Model</CardTitle>
                </CardHeader>
                <CardContent>
                  {(costs?.byModel ?? []).length > 0 ? (
                    <div className="h-64 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={costs!.byModel}
                            dataKey="costUsd"
                            nameKey="model"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            innerRadius={50}
                            paddingAngle={2}
                            label={({ name, value }: { name?: string; value?: number }) => `${(name || "").split("-").slice(0, 2).join("-")} $${(value ?? 0).toFixed(2)}`}
                            labelLine={{ stroke: "#71717a" }}
                          >
                            {(costs?.byModel ?? []).map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} style={{ stroke: "none" }} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No model data</div>
                  )}
                </CardContent>
              </Card>

              {/* Cost by Project — Table with progress bars */}
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cost by Project</CardTitle>
                </CardHeader>
                <CardContent>
                  {(costs?.byProject ?? []).length > 0 ? (
                    <div className="space-y-3">
                      {costs!.byProject.map((proj) => (
                        <div key={proj.projectId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-200 font-medium">{proj.name}</span>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{formatTokens(proj.tokenCount)} tokens</span>
                              <span>{proj.sessionCount} sessions</span>
                              <span className="text-zinc-200 font-medium">${proj.costUsd.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${maxProjectCost > 0 ? (proj.costUsd / maxProjectCost) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">No project data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Session Cost Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Daily Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {dailySorted.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Sessions</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Tokens</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailySorted.map((day) => (
                          <tr key={day.date} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
                            <td className="py-2 px-3 text-zinc-300">
                              {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="py-2 px-3 text-right text-zinc-400">{day.sessionCount}</td>
                            <td className="py-2 px-3 text-right text-zinc-400">{formatTokens(day.tokenCount)}</td>
                            <td className="py-2 px-3 text-right text-zinc-200 font-medium">${day.costUsd.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">No daily data available</div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
