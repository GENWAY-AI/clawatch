import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface AgentEvent {
  agentId: string;
  agentName: string;
  host: string;
  type: 'heartbeat' | 'cost' | 'status_change' | 'error';
  data?: Record<string, unknown>;
  timestamp: string;
}

export function postEvent(backendUrl: string, event: AgentEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/events', backendUrl);
    const body = JSON.stringify(event);
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}

export function postEvents(backendUrl: string, events: AgentEvent[]): Promise<void[]> {
  return Promise.all(events.map((e) => postEvent(backendUrl, e)));
}
