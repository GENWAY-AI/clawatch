"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Project } from "@/lib/types";
import { createProject } from "@/lib/api";

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

export interface ProjectsTabProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
}

export function ProjectsTab({ projects, setProjects }: ProjectsTabProps) {
  const router = useRouter();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Button variant="outline" size="sm" className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" onClick={() => setShowNewProject(!showNewProject)}>
          {showNewProject ? "Cancel" : "+ New Project"}
        </Button>
      </div>

      {showNewProject && (
        <Card className="mb-4">
          <CardContent className="pt-4 space-y-3">
            <input type="text" placeholder="Project name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" />
            <input type="text" placeholder="Description (optional)" value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" />
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" disabled={!newProjectName.trim()} onClick={async () => {
              const p = await createProject(newProjectName.trim(), newProjectDesc.trim());
              setProjects((prev) => [p, ...prev]);
              setNewProjectName("");
              setNewProjectDesc("");
              setShowNewProject(false);
            }}>
              Create Project
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {projects.map((project) => (
          <div key={project.id} onClick={() => router.push(`/dashboard/projects/${project.id}`)} className="rounded-xl border border-border/50 bg-card p-5 hover:border-emerald-500/30 transition-colors cursor-pointer group">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base group-hover:text-emerald-400 transition-colors mb-1">{project.name}</h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-1">{project.description}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{project.sessionCount} sessions</span>
                  {project.firstActivityAt && project.lastActivityAt && <span>{formatTimeline(project.firstActivityAt, project.lastActivityAt)}</span>}
                  {project.durationMs != null && project.durationMs > 0 && <span>{formatDuration(project.durationMs)}</span>}
                  {!project.firstActivityAt && <span>{formatRelativeTime(project.updatedAt)}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <div className="text-xl font-bold">${project.totalCostUsd.toFixed(2)}</div>
                <div className="text-[11px] text-muted-foreground">total cost</div>
              </div>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No projects yet. Create one to group sessions together.</div>}
      </div>
    </div>
  );
}
