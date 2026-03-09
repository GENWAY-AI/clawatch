import { Agent, Alert, CostData } from "./types";
import { mockAgents, mockAlerts, mockCosts } from "./mock-data";

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

export async function getAgents(): Promise<Agent[]> {
  if (USE_MOCK) return mockAgents;
  try {
    const data = await fetchJson<{ agents: Agent[] }>("/api/agents");
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
