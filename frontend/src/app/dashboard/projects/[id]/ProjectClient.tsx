"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectDetail, TimelineMessage, SessionStatus } from "@/lib/types";
import { getProject } from "@/lib/api";
import { ClaWatchIcon, ClaWatchLogo } from "@/components/clawatch-logo";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const AGENT_COLORS: Record<string, { border: string; bg: string; text: string; badge: string; dot: string }> = {
  dor: { border: "border-l-blue-400", bg: "bg-blue-500/10", text: "text-blue-400", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400" },
  ofek: { border: "border-l-amber-400", bg: "bg-amber-500/10", text: "text-amber-400", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  anas: { border: "border-l-emerald-400", bg: "bg-emerald-500/10", text: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
};

const AGENT_COLOR_LIST = ["blue-400", "emerald-400", "amber-400", "purple-400", "rose-400"];
const AGENT_BAR_COLORS = ["bg-blue-400", "bg-emerald-400", "bg-amber-400", "bg-purple-400", "bg-rose-400"];

function getAgentColor(agentId: string, index: number) {
  return AGENT_COLORS[agentId] || {
    border: `border-l-${AGENT_COLOR_LIST[index % 5]}`,
    bg: `bg-${AGENT_COLOR_LIST[index % 5]}/10`,
    text: `text-${AGENT_COLOR_LIST[index % 5]}`,
    badge: `bg-${AGENT_COLOR_LIST[index % 5]}/10 text-${AGENT_COLOR_LIST[index % 5]} border-${AGENT_COLOR_LIST[index % 5]}/20`,
    dot: `bg-${AGENT_COLOR_LIST[index % 5]}`,
  };
}

function getAgentBarColor(agentId: string): string {
  if (agentId === "dor") return "bg-blue-400";
  if (agentId === "ofek") return "bg-amber-400";
  if (agentId === "anas") return "bg-emerald-400";
  return "bg-purple-400";
}

const sessionStatusConfig: Record<SessionStatus, { color: string; dot: string; label: string }> = {
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Active" },
  idle: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Idle" },
  completed: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Completed" },
};

const TIMELINE_PAGE_SIZE = 200;

export default function ProjectClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineLimit, setTimelineLimit] = useState(TIMELINE_PAGE_SIZE);
  const [collapsedTools, setCollapsedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const data = await getProject(id);
        setProject(data);
      } catch {
        setError("Project not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function toggleToolCollapse(msgId: string) {
    setCollapsedTools((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading project...
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{error || "Project not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const visibleTimeline = project.timeline.slice(0, timelineLimit);
  const hasMoreTimeline = project.timeline.length > timelineLimit;

  // Build agent index for color lookup
  const agentIndex: Record<string, number> = {};
  project.agentBreakdown.forEach((a, i) => { agentIndex[a.agentId] = i; });

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
            <span className="text-sm text-muted-foreground">Project</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* Back + Header */}
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Back to Dashboard
          </button>

          <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
          <p className="text-sm text-muted-foreground mb-4">{project.description}</p>

          {/* Stats row */}
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-3xl font-bold">${project.stats.totalCostUsd.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground ml-2">total cost</span>
            </div>
            <div className="h-8 w-px bg-border/50" />
            <div className="text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{project.stats.sessionCount} sessions</div>
            </div>
            <div className="h-8 w-px bg-border/50" />
            <div className="text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{project.stats.totalMessages} messages</div>
            </div>
            <div className="h-8 w-px bg-border/50" />
            <div className="text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{formatTokens(project.stats.totalTokens)} tokens</div>
            </div>
            <div className="h-8 w-px bg-border/50" />
            <div className="text-xs text-muted-foreground">
              <div>{formatDate(project.stats.dateRange.from)} &mdash; {formatDate(project.stats.dateRange.to)}</div>
            </div>
          </div>
        </div>

        {/* Agent Participation */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Agent Participation</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {project.agentBreakdown.map((agent) => {
              const colors = getAgentColor(agent.agentId, agentIndex[agent.agentId]);
              return (
                <Card key={agent.agentId} className={`border-l-4 ${colors.border}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className={`border ${colors.badge} text-xs`}>
                        {agent.agentId}
                      </Badge>
                      <span className="text-lg font-bold">${agent.costUsd.toFixed(2)}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getAgentBarColor(agent.agentId)} transition-all`}
                          style={{ width: `${agent.percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{agent.percentage.toFixed(1)}% of total cost</span>
                        <span>{formatTokens(agent.tokenCount)} tokens</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {agent.messageCount} messages
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Sessions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Sessions</h2>
          <div className="grid gap-3">
            {project.sessions.map((session) => {
              const sc = sessionStatusConfig[session.status];
              const colors = getAgentColor(session.agentId, agentIndex[session.agentId] ?? 0);
              return (
                <div
                  key={session.id}
                  onClick={() => router.push(`/dashboard/sessions/${session.id}`)}
                  className="rounded-xl border border-border/50 bg-card p-4 hover:border-border transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <span className={`size-2.5 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate max-w-[500px] group-hover:text-emerald-400 transition-colors">
                          {session.title.length > 80 ? session.title.slice(0, 80) + "..." : session.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] border ${colors.badge}`}>
                          {session.agentId}
                        </Badge>
                        <span className="text-[11px] font-mono text-muted-foreground">{session.model}</span>
                        <span className="text-[11px] text-muted-foreground">{session.messageCount} msgs</span>
                        <span className="text-[11px] text-muted-foreground">{formatRelativeTime(session.lastActivityAt)}</span>
                      </div>
                    </div>
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
          </div>
        </div>

        {/* Unified Timeline */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Unified Timeline</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Messages from all sessions merged chronologically
          </p>
          <div className="space-y-2">
            {visibleTimeline.map((msg) => (
              <TimelineMessageBubble
                key={msg.id}
                message={msg}
                agentIndex={agentIndex}
                collapsed={collapsedTools.has(msg.id)}
                onToggle={() => toggleToolCollapse(msg.id)}
              />
            ))}
          </div>
          {hasMoreTimeline && (
            <div className="text-center mt-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => setTimelineLimit((prev) => prev + TIMELINE_PAGE_SIZE)}
              >
                Load more ({project.timeline.length - timelineLimit} remaining)
              </Button>
            </div>
          )}
          {project.timeline.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No timeline messages yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineMessageBubble({
  message: msg,
  agentIndex,
  collapsed,
  onToggle,
}: {
  message: TimelineMessage;
  agentIndex: Record<string, number>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const colors = getAgentColor(msg.agentId, agentIndex[msg.agentId] ?? 0);
  const isError = msg.content.toLowerCase().includes("error");

  if (msg.role === "user") {
    return (
      <div className={`rounded-lg border-l-4 ${colors.border} border border-blue-500/20 bg-blue-500/10 p-4 ${isError ? "border-red-500/30 bg-red-500/10" : ""}`}>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className={`text-[10px] border ${colors.badge}`}>{msg.agentId}</Badge>
          <span className="text-xs font-medium text-blue-400">User</span>
          <span className="text-[11px] text-muted-foreground">{formatRelativeTime(msg.timestamp)}</span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
      </div>
    );
  }

  if (msg.role === "assistant") {
    return (
      <div className={`rounded-lg border-l-4 ${colors.border} border border-border/50 bg-zinc-800/50 p-4 ${isError ? "border-red-500/30 bg-red-500/10" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] border ${colors.badge}`}>{msg.agentId}</Badge>
            <span className="text-xs font-medium text-zinc-400">Assistant</span>
            {msg.model && <span className="text-[10px] font-mono text-muted-foreground">{msg.model}</span>}
            <span className="text-[11px] text-muted-foreground">{formatRelativeTime(msg.timestamp)}</span>
          </div>
          {msg.costUsd != null && (
            <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              ${msg.costUsd.toFixed(2)}
            </Badge>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
      </div>
    );
  }

  if (msg.role === "tool") {
    return (
      <div className={`rounded-lg border-l-4 ${colors.border} border border-border/50 bg-zinc-900 p-4 ${isError ? "border-red-500/30 bg-red-500/10" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] border ${colors.badge}`}>{msg.agentId}</Badge>
            <span className="text-xs text-amber-400">Tool</span>
            {msg.toolName && (
              <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/20">
                {msg.toolName}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">{formatRelativeTime(msg.timestamp)}</span>
          </div>
          <button onClick={onToggle} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
        {!collapsed && (
          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all">{msg.content}</pre>
        )}
      </div>
    );
  }

  // system
  return (
    <div className={`rounded-lg border-l-4 ${colors.border} px-4 py-2`}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-[10px] border ${colors.badge}`}>{msg.agentId}</Badge>
        <span className="text-[11px] text-muted-foreground">System</span>
        <span className="text-[11px] text-muted-foreground">{formatRelativeTime(msg.timestamp)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{msg.content}</p>
    </div>
  );
}
