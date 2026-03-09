import * as os from 'os';
import { AgentEvent } from './api';

const HOST = os.hostname();

interface SessionEvent {
  type: 'session';
  id: string;
  timestamp: string;
  cwd?: string;
}

interface MessageEvent {
  type: 'message';
  timestamp: string;
  message?: {
    role?: string;
    model?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      cost?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        total?: number;
      };
    };
  };
}

type JsonlEvent = SessionEvent | MessageEvent | { type: string; timestamp?: string; [key: string]: unknown };

export function parseLine(line: string): JsonlEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function mapEventToApiEvents(event: JsonlEvent, agentId: string): AgentEvent[] {
  const agentName = agentId;
  const timestamp = event.timestamp || new Date().toISOString();
  const results: AgentEvent[] = [];

  if (event.type === 'session') {
    results.push({
      agentId,
      agentName,
      host: HOST,
      type: 'status_change',
      data: { status: 'running' },
      timestamp,
    });
  }

  if (event.type === 'message') {
    const msg = (event as MessageEvent).message;
    if (msg?.usage?.cost?.total !== undefined) {
      results.push({
        agentId,
        agentName,
        host: HOST,
        type: 'cost',
        data: {
          costUsd: msg.usage.cost.total,
          tokenCount: msg.usage.totalTokens || 0,
          model: msg.model || 'unknown',
        },
        timestamp,
      });
    }

    if (msg?.role === 'assistant') {
      results.push({
        agentId,
        agentName,
        host: HOST,
        type: 'heartbeat',
        timestamp,
      });
    }
  }

  return results;
}

export function parseGatewayError(line: string, agentId: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  return {
    agentId,
    agentName: agentId,
    host: HOST,
    type: 'error',
    data: { error: trimmed },
    timestamp: new Date().toISOString(),
  };
}
