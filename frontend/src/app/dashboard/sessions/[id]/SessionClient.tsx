"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SessionDetail, SessionStatus, SessionMessage } from "@/lib/types";
import { getSession } from "@/lib/api";
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

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const sessionStatusConfig: Record<SessionStatus, { color: string; dot: string; label: string }> = {
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Active" },
  idle: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", label: "Idle" },
  completed: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400", label: "Completed" },
};

const TRUNCATE_LIMIT = 500;

function ExpandableText({
  text,
  className,
  preformatted = false,
}: {
  text: string;
  className?: string;
  preformatted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > TRUNCATE_LIMIT;
  const displayText = needsTruncation && !expanded ? text.slice(0, TRUNCATE_LIMIT) + "…" : text;

  const Tag = preformatted ? "pre" : "p";

  return (
    <div>
      <Tag className={className}>{displayText}</Tag>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

const agentColors: Record<string, string> = {
  ofek: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  anas: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  dor: "bg-teal-500/10 text-teal-400 border-teal-500/20",
};

export default function SessionClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedTools, setCollapsedTools] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getSession(id);
        setSession(data);
      } catch {
        setError("Session not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    if (session && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, [session?.id]);

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
          Loading session...
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{error || "Session not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const sc = sessionStatusConfig[session.status];
  const totalTokens = session.tokenBreakdown.input + session.tokenBreakdown.output + session.tokenBreakdown.cacheRead + session.tokenBreakdown.cacheWrite;
  const maxModelCost = Math.max(...session.costByModel.map((m) => m.costUsd));

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
            <span className="text-sm text-muted-foreground">Session Detail</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Back + Header */}
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Back to Dashboard
          </button>

          <div className="space-y-3">
            <h1 className="text-2xl font-bold">{session.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`border ${agentColors[session.agentId] || "text-zinc-400"}`}>
                {session.agentId}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {session.model}
              </Badge>
              <Badge variant="outline" className={`border ${sc.color}`}>
                <span className={`size-1.5 rounded-full ${sc.dot} mr-1.5`} />
                {sc.label}
              </Badge>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-3xl font-bold">${session.costUsd.toFixed(2)}</span>
              </div>
              <div className="text-muted-foreground">
                <div>{formatTokens(session.tokenCount)} tokens</div>
                <div>{session.messageCount} messages</div>
              </div>
              <div className="text-muted-foreground text-xs">
                <div>Started: {formatRelativeTime(session.startedAt)} ({formatAbsoluteTime(session.startedAt)})</div>
                <div>Last activity: {formatRelativeTime(session.lastActivityAt)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Cost by Model */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By Model</h3>
                {session.costByModel.map((item) => (
                  <div key={item.model} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{item.model}</span>
                      <span className="font-medium">${item.costUsd.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${(item.costUsd / maxModelCost) * 100}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">{formatTokens(item.tokenCount)} tokens</div>
                  </div>
                ))}
              </div>

              {/* Token Breakdown */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Token Breakdown</h3>
                {([
                  { label: "Input", value: session.tokenBreakdown.input, color: "bg-blue-500" },
                  { label: "Output", value: session.tokenBreakdown.output, color: "bg-emerald-500" },
                  { label: "Cache Read", value: session.tokenBreakdown.cacheRead, color: "bg-amber-500" },
                  { label: "Cache Write", value: session.tokenBreakdown.cacheWrite, color: "bg-purple-500" },
                ] as const).map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs">{item.label}</span>
                      <span className="font-medium font-mono">{formatTokens(item.value)}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all`}
                        style={{ width: `${(item.value / totalTokens) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Message Timeline */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Messages</h2>
          <div className="relative space-y-3">
            {/* Vertical timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border/50" />

            {session.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                collapsed={collapsedTools.has(msg.id)}
                onToggle={() => toggleToolCollapse(msg.id)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message: msg,
  collapsed,
  onToggle,
}: {
  message: SessionMessage;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const isError = msg.content.toLowerCase().includes("error");

  if (msg.role === "user") {
    return (
      <div className="relative pl-12 flex justify-end">
        <div className="absolute left-3.5 top-3 size-3 rounded-full bg-blue-500 ring-4 ring-background z-10" />
        <div className={`rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 max-w-[80%] ${isError ? "border-red-500/30 bg-red-500/10" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-blue-400">User</span>
            <span className="text-[11px] text-muted-foreground">{formatAbsoluteTime(msg.timestamp)}</span>
          </div>
          <ExpandableText text={msg.content} className="text-sm whitespace-pre-wrap" />
        </div>
      </div>
    );
  }

  if (msg.role === "assistant") {
    return (
      <div className="relative pl-12">
        <div className="absolute left-3.5 top-3 size-3 rounded-full bg-zinc-500 ring-4 ring-background z-10" />
        <div className={`rounded-lg border border-border/50 bg-zinc-800/50 p-4 max-w-[80%] ${isError ? "border-red-500/30 bg-red-500/10" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">Assistant</span>
              {msg.model && <span className="text-[10px] font-mono text-muted-foreground">{msg.model}</span>}
              <span className="text-[11px] text-muted-foreground">{formatAbsoluteTime(msg.timestamp)}</span>
            </div>
            {msg.costUsd != null && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  ${msg.costUsd.toFixed(2)}
                </Badge>
                {msg.tokenCount != null && (
                  <span className="text-[10px] text-muted-foreground">{formatTokens(msg.tokenCount)}</span>
                )}
              </div>
            )}
          </div>
          <ExpandableText text={msg.content} className="text-sm whitespace-pre-wrap" />
        </div>
      </div>
    );
  }

  if (msg.role === "tool") {
    return (
      <div className="relative pl-12">
        <div className="absolute left-3.5 top-3 size-3 rounded-full bg-amber-500 ring-4 ring-background z-10" />
        <div className={`rounded-lg border border-border/50 bg-zinc-900 p-4 ${isError ? "border-red-500/30 bg-red-500/10" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400">Tool</span>
              {msg.toolName && (
                <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/20">
                  {msg.toolName}
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground">{formatAbsoluteTime(msg.timestamp)}</span>
            </div>
            <button
              onClick={onToggle}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed ? "Show" : "Hide"}
            </button>
          </div>
          {msg.toolInput && (
            <div className="bg-black/30 rounded px-2 py-1 mb-2 overflow-x-auto">
              <ExpandableText text={msg.toolInput} className="text-[11px] font-mono text-muted-foreground" preformatted />
            </div>
          )}
          {!collapsed && (
            <ExpandableText text={msg.content} className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all" preformatted />
          )}
        </div>
      </div>
    );
  }

  // system
  return (
    <div className="relative pl-12">
      <div className="absolute left-3.5 top-3 size-3 rounded-full bg-zinc-700 ring-4 ring-background z-10" />
      <div className="rounded-lg px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">System</span>
          <span className="text-[11px] text-muted-foreground">{formatAbsoluteTime(msg.timestamp)}</span>
        </div>
        <ExpandableText text={msg.content} className="text-xs text-muted-foreground mt-1" />
      </div>
    </div>
  );
}
