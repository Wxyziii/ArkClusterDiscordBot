import type { BotConfig } from "./config.js";

export class ManagerClient {
  constructor(private readonly config: BotConfig) {}

  async get<T = unknown>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
      const err = parsed as { error?: { code?: string; message?: string }; reason?: string; message?: string; status?: string };
      const code = err.error?.code ?? err.status ?? String(res.status);
      const message = err.error?.message ?? err.reason ?? err.message ?? text;
      throw new ManagerError(res.status, code, message, parsed);
    }
    return parsed as T;
  }
}

export class ManagerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly payload: unknown
  ) {
    super(`${code}: ${message}`);
    this.name = "ManagerError";
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
