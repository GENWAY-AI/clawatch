"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Session, SessionStatus, Project } from "@/lib/types";
import { setSessionProjects, removeSessionProject } from "@/lib/api";

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

// --- ProjectTagChips ---
function ProjectTagChips({ session, allProjects, onAdd, onRemove }: {
  session: Session; allProjects: Project[];
  onAdd: (projectId: string) => void; onRemove: (projectId: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sessionProjects = session.projects ?? [];
  const taggedIds = new Set(sessionProjects.map((p) => p.id));
  const available = allProjects.filter((p) => !taggedIds.has(p.id));

  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  if (sessionProjects.length === 0 && available.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 group/tags">
      {sessionProjects.map((proj) => (
        <span key={proj.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {proj.name}
          <button onClick={(e) => { e.stopPropagation(); onRemove(proj.id); }} className="hover:text-amber-200 transition-colors ml-0.5 leading-none">&times;</button>
        </span>
      ))}
      {available.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }} className="inline-flex items-center justify-center size-5 rounded-full border border-dashed border-zinc-600 text-zinc-500 hover:border-amber-500/40 hover:text-amber-400 transition-colors text-[11px] opacity-0 group-hover/tags:opacity-100 focus:opacity-100" title="Add project tag">+</button>
          {showDropdown && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border/50 bg-zinc-900 shadow-lg py-1">
              {available.map((proj) => (
                <button key={proj.id} onClick={(e) => { e.stopPropagation(); onAdd(proj.id); setShowDropdown(false); }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-amber-500/10 hover:text-amber-400 transition-colors">{proj.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Types ---
type SessionFilter = "all" | "active" | "idle" | "completed";
type SessionSort = "recent" | "cost" | "tokens";
const SESSIONS_PER_PAGE = 10;

export interface SessionsTabProps {
  sessions: Session[];
  sessionsTotal: number;
  projects: Project[];
  sessionFilter: SessionFilter;
  setSessionFilter: (f: SessionFilter) => void;
  sessionSort: SessionSort;
  setSessionSort: (s: SessionSort) => void;
  sessionPage: number;
  setSessionPage: (p: number) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
}

export function SessionsTab({
  sessions, sessionsTotal, projects,
  sessionFilter, setSessionFilter, sessionSort, setSessionSort,
  sessionPage, setSessionPage, setSessions,
}: SessionsTabProps) {
  const router = useRouter();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {(["all", "active", "idle", "completed"] as SessionFilter[]).map((f) => (
            <button key={f} onClick={() => setSessionFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${sessionFilter === f ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground mr-1">Sort:</span>
          {(["recent", "cost", "tokens"] as SessionSort[]).map((s) => (
            <button key={s} onClick={() => setSessionSort(s)} className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${sessionSort === s ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {sessions.map((session) => {
          const sc = sessionStatusConfig[session.status];
          return (
            <div key={session.id} onClick={() => router.push(`/dashboard/sessions/${session.id}`)} className="rounded-xl border border-border/50 bg-card p-4 hover:border-border transition-colors cursor-pointer group">
              <div className="flex items-start gap-4">
                <span className={`size-2.5 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate max-w-[500px] group-hover:text-emerald-400 transition-colors">
                      {session.title.length > 80 ? session.title.slice(0, 80) + "..." : session.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] border ${agentColors[session.agentId] || "text-zinc-400"}`}>{session.agentId}</Badge>
                    <span className="text-[11px] font-mono text-muted-foreground">{session.model}</span>
                    <span className="text-[11px] text-muted-foreground">{session.messageCount} msgs</span>
                    <span className="text-[11px] text-muted-foreground">{formatRelativeTime(session.lastActivityAt)}</span>
                  </div>
                  <ProjectTagChips
                    session={session}
                    allProjects={projects}
                    onRemove={async (projectId) => {
                      const prev = session.projects ?? [];
                      setSessions((s) => s.map((sess) => sess.id === session.id ? { ...sess, projects: prev.filter((p) => p.id !== projectId) } : sess));
                      try { await removeSessionProject(session.id, projectId); } catch { setSessions((s) => s.map((sess) => sess.id === session.id ? { ...sess, projects: prev } : sess)); }
                    }}
                    onAdd={async (projectId) => {
                      const proj = projects.find((p) => p.id === projectId);
                      if (!proj) return;
                      const prev = session.projects ?? [];
                      const next = [...prev, { id: proj.id, name: proj.name }];
                      setSessions((s) => s.map((sess) => sess.id === session.id ? { ...sess, projects: next } : sess));
                      try { await setSessionProjects(session.id, next.map((p) => p.id)); } catch { setSessions((s) => s.map((sess) => sess.id === session.id ? { ...sess, projects: prev } : sess)); }
                    }}
                  />
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
        {sessions.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No sessions found for the selected filter.</div>}
      </div>

      {sessionsTotal > SESSIONS_PER_PAGE && (
        <div className="flex items-center justify-between mt-3">
          <Button variant="outline" size="sm" className="text-xs" disabled={sessionPage <= 1} onClick={() => setSessionPage(sessionPage - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {sessionPage} of {Math.ceil(sessionsTotal / SESSIONS_PER_PAGE)}</span>
          <Button variant="outline" size="sm" className="text-xs" disabled={sessionPage >= Math.ceil(sessionsTotal / SESSIONS_PER_PAGE)} onClick={() => setSessionPage(sessionPage + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
