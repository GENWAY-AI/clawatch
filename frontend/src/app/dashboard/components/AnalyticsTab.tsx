"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsData, SpendData } from "@/lib/types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea } from "recharts";

// --- Helpers ---
function parseChartDate(d: string): Date {
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

type TimeWindow = "1h" | "24h" | "7d" | "30d" | "all" | "custom";
type ZoomRange = { left: string; right: string } | null;

export interface AnalyticsTabProps {
  analyticsData: AnalyticsData | null;
  analyticsLoading: boolean;
  showingDemoData: boolean;
  spendData: SpendData | null;
  // Time window
  timeWindow: TimeWindow;
  setTimeWindowParam: (w: TimeWindow) => void;
  customFrom: string;
  customTo: string;
  setCustomDates: (from: string, to: string) => void;
  // Zoom
  zoomRange: ZoomRange;
  zoomLeft: string | null;
  zoomRight: string | null;
  zoomFetching: boolean;
  isDragging: boolean;
  handleZoomMouseDown: (e: Record<string, unknown>) => void;
  handleZoomMouseMove: (e: Record<string, unknown>) => void;
  handleZoomMouseUp: () => void;
  resetZoom: () => void;
  // Data
  zoomedBuckets: AnalyticsData["buckets"];
  zoomedByProject: AnalyticsData["byProject"];
  zoomedByAgent: AnalyticsData["byAgent"];
  effectiveGroupBy: "hour" | "day";
  activeLabel: string;
  // Series visibility
  hiddenAgentSeries: Set<string>;
  setHiddenAgentSeries: React.Dispatch<React.SetStateAction<Set<string>>>;
  hiddenProjectSeries: Set<string>;
  setHiddenProjectSeries: React.Dispatch<React.SetStateAction<Set<string>>>;
  // For resetting zoom state on time window change
  clearZoomState: () => void;
}

export function AnalyticsTab({
  analyticsData, analyticsLoading, showingDemoData, spendData,
  timeWindow, setTimeWindowParam, customFrom, customTo, setCustomDates,
  zoomRange, zoomLeft, zoomRight, zoomFetching, isDragging,
  handleZoomMouseDown, handleZoomMouseMove, handleZoomMouseUp, resetZoom,
  zoomedBuckets, zoomedByProject, zoomedByAgent, effectiveGroupBy, activeLabel,
  hiddenAgentSeries, setHiddenAgentSeries, hiddenProjectSeries, setHiddenProjectSeries,
  clearZoomState,
}: AnalyticsTabProps) {
  // Tooltip date formatter
  const formatTooltipDate = (label: string) => {
    const date = parseChartDate(label);
    if (effectiveGroupBy === "hour") {
      return date.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    }
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  // Dynamic date formatting based on zoom level
  const zoomChartDateFormatter = (d: string) => {
    if (zoomRange) {
      const leftDate = parseChartDate(zoomRange.left);
      const rightDate = parseChartDate(zoomRange.right);
      const rangeDays = (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000);
      const date = parseChartDate(d);
      if (rangeDays <= 1) {
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
      if (rangeDays <= 7) {
        const month = date.toLocaleDateString("en-US", { month: "short" });
        return `${month} ${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
    }
    return formatChartDate(d, effectiveGroupBy);
  };

  // Chart colors
  const projectColors = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];
  const agentChartColors: Record<string, string> = { ofek: "#3b82f6", anas: "#a855f7", dor: "#14b8a6" };
  const defaultAgentColors = ["#6366f1", "#ec4899", "#f59e0b", "#84cc16", "#06b6d4"];

  if (!analyticsData) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
        <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        Loading analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time window controls */}
      <div className="flex flex-wrap items-center gap-2">
        {analyticsLoading && analyticsData && (
          <span className="size-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        )}
        {(["24h", "7d", "30d", "all", "custom"] as const).map((w) => {
          const isActive = timeWindow === w && !zoomRange;
          return (
            <button
              key={w}
              onClick={() => { setTimeWindowParam(w); clearZoomState(); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
              }`}
            >
              {w === "custom" ? "Custom" : w === "all" ? "All time" : w === "24h" ? "Last 24h" : w === "7d" ? "Last 7d" : "Last 30d"}
            </button>
          );
        })}
        {timeWindow === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomDates(e.target.value, customTo)} className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 focus:border-emerald-500/50 focus:outline-none" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomDates(customFrom, e.target.value)} className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 focus:border-emerald-500/50 focus:outline-none" />
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
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Period Cost</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${totalCostPeriod.toFixed(2)}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">{activeLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatTokens(totalTokens)}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">{activeLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalSessions}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">{activeLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{effectiveGroupBy === "hour" ? "Avg Hourly Cost" : "Avg Daily Cost"}</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${avgDailyCost.toFixed(2)}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">{activeLabel}</div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Zoom header helper */}
      {(() => {
        const ZoomHeader = ({ title }: { title: string }) => (
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <div className="flex items-center gap-2">
              {!zoomRange && !showingDemoData && <span className="text-[11px] text-muted-foreground/50">Click &amp; drag to zoom</span>}
              {showingDemoData && <span className="text-[11px] text-muted-foreground/50">Zoom available with live data</span>}
              {zoomRange && (
                <>
                  {zoomFetching && <span className="size-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />}
                  <span className="text-xs text-emerald-400/80 font-medium">
                    {(() => {
                      const fmt = (d: string) => {
                        const date = parseChartDate(d);
                        const leftDate = parseChartDate(zoomRange.left);
                        const rightDate = parseChartDate(zoomRange.right);
                        const rangeDays = (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000);
                        if (rangeDays <= 3) return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
                        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                      };
                      return `${fmt(zoomRange.left)} — ${fmt(zoomRange.right)}`;
                    })()}
                  </span>
                  <button onClick={resetZoom} className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors">↩ Reset zoom</button>
                </>
              )}
            </div>
          </CardHeader>
        );

        const chartCursor = { cursor: isDragging ? "col-resize" : "crosshair", userSelect: isDragging ? "none" as const : "auto" as const };
        const yFormatter = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 10 ? 2 : 0)}`;

        return (
          <>
            {/* Total usage over time */}
            <Card>
              <ZoomHeader title="Total Usage Over Time" />
              <CardContent>
                <div className="h-[300px]" style={chartCursor}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={zoomedBuckets} onMouseDown={handleZoomMouseDown} onMouseMove={handleZoomMouseMove} onMouseUp={handleZoomMouseUp}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => zoomChartDateFormatter(String(d))} />
                      <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={yFormatter} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const bucket = zoomedBuckets.find((b) => b.date === label);
                        return (
                          <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ color: "#a1a1aa", marginBottom: 4, fontSize: 12 }}>{formatTooltipDate(String(label))}</div>
                            <div style={{ color: "#e4e4e7", fontSize: 13 }}>Cost: ${bucket?.costUsd?.toFixed(2) ?? "0"}</div>
                            <div style={{ color: "#a1a1aa", fontSize: 12 }}>Tokens: {formatTokens(bucket?.tokenCount ?? 0)}</div>
                            <div style={{ color: "#a1a1aa", fontSize: 12 }}>Sessions: {bucket?.sessionCount ?? 0}</div>
                          </div>
                        );
                      }} />
                      <Area type="monotone" dataKey="costUsd" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
                      {spendData?.limits?.amount && (
                        <ReferenceLine y={spendData.limits.amount} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `Limit: $${spendData.limits.amount}`, position: "insideTopRight", fill: "#ef4444", fontSize: 11 }} />
                      )}
                      {zoomLeft && zoomRight && <ReferenceArea x1={zoomLeft} x2={zoomRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.15} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Usage by Project */}
            <Card>
              <CardHeader><CardTitle className="text-base font-semibold">Usage by Project</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]" style={chartCursor}>
                  <ResponsiveContainer width="100%" height="100%">
                    {(() => {
                      const dates = zoomedBuckets.map((b) => b.date);
                      const merged = dates.map((date) => {
                        const row: Record<string, string | number> = { date };
                        for (const proj of zoomedByProject) { const bucket = proj.buckets.find((b) => b.date === date); row[proj.name] = bucket?.costUsd ?? 0; }
                        return row;
                      });
                      return (
                        <AreaChart data={merged} onMouseDown={handleZoomMouseDown} onMouseMove={handleZoomMouseMove} onMouseUp={handleZoomMouseUp}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => zoomChartDateFormatter(String(d))} />
                          <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={yFormatter} />
                          <Tooltip content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const visible = payload.filter((p) => !hiddenProjectSeries.has(String(p.dataKey)));
                            if (!visible.length) return null;
                            return (
                              <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px" }}>
                                <div style={{ color: "#a1a1aa", marginBottom: 4, fontSize: 12 }}>{formatTooltipDate(String(label))}</div>
                                {visible.map((entry) => <div key={String(entry.dataKey)} style={{ color: String(entry.color), fontSize: 12 }}>{String(entry.dataKey)}: ${Number(entry.value).toFixed(2)}</div>)}
                              </div>
                            );
                          }} />
                          <Legend
                            wrapperStyle={{ color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}
                            onClick={(e, _idx, event) => {
                              const key = String(e.dataKey);
                              const allKeys = analyticsData!.byProject.map((p) => p.name);
                              const nativeEvent = (event as unknown as React.MouseEvent)?.nativeEvent ?? event;
                              const isMulti = (nativeEvent as MouseEvent)?.metaKey || (nativeEvent as MouseEvent)?.ctrlKey;
                              setHiddenProjectSeries((prev) => {
                                if (isMulti) { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }
                                const visible = allKeys.filter((k) => !prev.has(k));
                                if (visible.length === 1 && visible[0] === key) return new Set();
                                return new Set(allKeys.filter((k) => k !== key));
                              });
                            }}
                            formatter={(value) => <span style={{ color: hiddenProjectSeries.has(String(value)) ? "#52525b" : "#a1a1aa", textDecoration: hiddenProjectSeries.has(String(value)) ? "line-through" : "none" }}>{String(value)}</span>}
                          />
                          {analyticsData!.byProject.map((proj, i) => {
                            const color = projectColors[i % projectColors.length];
                            const hidden = hiddenProjectSeries.has(proj.name);
                            return <Area key={proj.projectId} type="monotone" dataKey={proj.name} stroke={hidden ? "transparent" : color} fill={hidden ? "transparent" : color} fillOpacity={hidden ? 0 : 0.15} strokeWidth={2} />;
                          })}
                          {zoomLeft && zoomRight && <ReferenceArea x1={zoomLeft} x2={zoomRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.15} />}
                        </AreaChart>
                      );
                    })()}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Usage by Agent */}
            <Card>
              <CardHeader><CardTitle className="text-base font-semibold">Usage by Agent</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]" style={chartCursor}>
                  <ResponsiveContainer width="100%" height="100%">
                    {(() => {
                      const dates = zoomedBuckets.map((b) => b.date);
                      const merged = dates.map((date) => {
                        const row: Record<string, string | number> = { date };
                        for (const agent of zoomedByAgent) { const bucket = agent.buckets.find((b) => b.date === date); row[agent.agentId] = bucket?.costUsd ?? 0; }
                        return row;
                      });
                      return (
                        <AreaChart data={merged} onMouseDown={handleZoomMouseDown} onMouseMove={handleZoomMouseMove} onMouseUp={handleZoomMouseUp}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="date" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d) => zoomChartDateFormatter(String(d))} />
                          <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={yFormatter} />
                          <Tooltip content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const visible = payload.filter((p) => !hiddenAgentSeries.has(String(p.dataKey)));
                            if (!visible.length) return null;
                            return (
                              <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px" }}>
                                <div style={{ color: "#a1a1aa", marginBottom: 4, fontSize: 12 }}>{formatTooltipDate(String(label))}</div>
                                {visible.map((entry) => <div key={String(entry.dataKey)} style={{ color: String(entry.color), fontSize: 12 }}>{String(entry.dataKey)}: ${Number(entry.value).toFixed(2)}</div>)}
                              </div>
                            );
                          }} />
                          <Legend
                            wrapperStyle={{ color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}
                            onClick={(e, _idx, event) => {
                              const key = String(e.dataKey);
                              const allKeys = analyticsData!.byAgent.map((a) => a.agentId);
                              const nativeEvent = (event as unknown as React.MouseEvent)?.nativeEvent ?? event;
                              const isMulti = (nativeEvent as MouseEvent)?.metaKey || (nativeEvent as MouseEvent)?.ctrlKey;
                              setHiddenAgentSeries((prev) => {
                                if (isMulti) { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }
                                const visible = allKeys.filter((k) => !prev.has(k));
                                if (visible.length === 1 && visible[0] === key) return new Set();
                                return new Set(allKeys.filter((k) => k !== key));
                              });
                            }}
                            formatter={(value) => <span style={{ color: hiddenAgentSeries.has(String(value)) ? "#52525b" : "#a1a1aa", textDecoration: hiddenAgentSeries.has(String(value)) ? "line-through" : "none" }}>{String(value)}</span>}
                          />
                          {analyticsData!.byAgent.map((agent, i) => {
                            const color = agentChartColors[agent.agentId] || defaultAgentColors[i % defaultAgentColors.length];
                            const hidden = hiddenAgentSeries.has(agent.agentId);
                            return <Area key={agent.agentId} type="monotone" dataKey={agent.agentId} stroke={hidden ? "transparent" : color} fill={hidden ? "transparent" : color} fillOpacity={hidden ? 0 : 0.15} strokeWidth={2} />;
                          })}
                          {zoomLeft && zoomRight && <ReferenceArea x1={zoomLeft} x2={zoomRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.15} />}
                        </AreaChart>
                      );
                    })()}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        );
      })()}
    </div>
  );
}
