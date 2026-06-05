import type { BotConfig } from "./config.js";

export class ManagerClient {
  constructor(private readonly config: BotConfig) {}

  async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.managerApiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.managerApiToken}`,
        "content-type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    const parsed = text ? safeJson(text) : {};
    if (!res.ok) {
      const err = parsed as { error?: { code?: string; message?: string } };
      throw new Error(`${err.error?.code ?? res.status}: ${err.error?.message ?? text}`);
    }
    return parsed;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export function compact(value: unknown, max = 1700): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max - 20)}\n...truncated` : text;
}
