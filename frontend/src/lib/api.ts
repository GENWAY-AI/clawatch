import { Agent, Alert, CostData, Session, SessionDetail, Project, ProjectDetail } from "./types";
import { mockAgents, mockAlerts, mockCosts, mockSessions, mockSessionDetails, mockProjects, mockProjectDetails } from "./mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const USE_MOCK = !process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(API_KEY ? { "X-ClaWatch-Key": API_KEY } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getAgents(status?: string): Promise<Agent[]> {
  if (USE_MOCK) return mockAgents;
  try {
    const qs = status ? `?status=${status}` : "";
    const data = await fetchJson<{ agents: Agent[] }>(`/api/agents${qs}`);
    return data.agents;
  } catch {
    console.warn("API unreachable, falling back to mock data");
    return mockAgents;
  }
}

export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) return mockAlerts;
  try {
    const data = await fetchJson<{ alerts: Alert[] }>("/api/alerts");
    return data.alerts;
  } catch {
    console.warn("API unreachable, falling back to mock data");
    return mockAlerts;
  }
}

export async function getCosts(): Promise<CostData> {
  if (USE_MOCK) return mockCosts;
  try {
    return await fetchJson<CostData>("/api/costs");
  } catch {
    console.warn("API unreachable, falling back to mock data");
    return mockCosts;
  }
}

export async function pauseAgent(id: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/agents/${id}/pause`, { method: "POST" });
}

export async function resumeAgent(id: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/agents/${id}/resume`, { method: "POST" });
}

export async function acknowledgeAlert(id: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/alerts/${id}/acknowledge`, { method: "POST" });
}

export async function getSessions(
  agentId?: string,
  status?: string,
  sort?: string
): Promise<Session[]> {
  if (USE_MOCK) {
    let sessions = [...mockSessions];
    if (agentId) sessions = sessions.filter((s) => s.agentId === agentId);
    if (status) sessions = sessions.filter((s) => s.status === status);
    if (sort === "cost") sessions.sort((a, b) => b.costUsd - a.costUsd);
    else if (sort === "tokens") sessions.sort((a, b) => b.tokenCount - a.tokenCount);
    else sessions.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return sessions;
  }
  try {
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    const data = await fetchJson<{ sessions: Session[] }>(`/api/sessions${qs ? `?${qs}` : ""}`);
    return data.sessions;
  } catch {
    console.warn("API unreachable, falling back to mock data");
    return mockSessions;
  }
}

export async function getSession(id: string): Promise<SessionDetail> {
  if (USE_MOCK) {
    const detail = mockSessionDetails[id];
    if (detail) return detail;
    throw new Error("Session not found");
  }
  try {
    return await fetchJson<SessionDetail>(`/api/sessions/${id}`);
  } catch {
    console.warn("API unreachable, falling back to mock data");
    const detail = mockSessionDetails[id];
    if (detail) return detail;
    throw new Error("Session not found");
  }
}

export async function getProjects(): Promise<Project[]> {
  if (USE_MOCK) return mockProjects;
  try {
    const data = await fetchJson<{ projects: Project[] }>("/api/projects");
    return data.projects;
  } catch {
    console.warn("API unreachable, falling back to mock data");
    return mockProjects;
  }
}

export async function getProject(id: string): Promise<ProjectDetail> {
  if (USE_MOCK) {
    const detail = mockProjectDetails[id];
    if (detail) return detail;
    throw new Error("Project not found");
  }
  try {
    return await fetchJson<ProjectDetail>(`/api/projects/${id}`);
  } catch {
    console.warn("API unreachable, falling back to mock data");
    const detail = mockProjectDetails[id];
    if (detail) return detail;
    throw new Error("Project not found");
  }
}

export async function createProject(name: string, description: string): Promise<Project> {
  if (USE_MOCK) {
    return {
      id: `project-${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionCount: 0,
      totalCostUsd: 0,
    };
  }
  return await fetchJson<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function addSessionToProject(projectId: string, sessionId: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/projects/${projectId}/sessions`, {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function removeSessionFromProject(projectId: string, sessionId: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/projects/${projectId}/sessions/${sessionId}`, {
    method: "DELETE",
  });
}
