// 共通ロガーモジュール (Axiom Ingest API 対応)

export interface LogEvent {
  _time: string;
  app: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
  error?: Record<string, unknown> | string;
}

export interface LoggerOptions {
  dataset?: string;
  token?: string;
  apiUrl?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  stdout?: boolean;
}

export class Logger {
  readonly appName: string;
  private queue: LogEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private options?: LoggerOptions;

  constructor(appName: string, options?: LoggerOptions) {
    this.appName = appName;
    this.options = options;
  }

  private getEnv(key: string): string | undefined {
    try {
      if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
        return Deno.env.get(key);
      }
    } catch {
      // 権限がない場合等は安全にフォールバック
    }
    return undefined;
  }

  private get token(): string | undefined {
    const t = this.options?.token ?? this.getEnv("AXIOM_TOKEN");
    return t && t.trim().length > 0 ? t : undefined;
  }

  private get dataset(): string {
    const ds = this.options?.dataset ?? this.getEnv("AXIOM_DATASET");
    return ds && ds.trim().length > 0 ? ds : "personal-apps";
  }

  private get apiUrl(): string {
    return (
      this.options?.apiUrl ??
      `https://api.axiom.co/v1/datasets/${encodeURIComponent(this.dataset)}/ingest`
    );
  }

  /**
   * キューに溜まっている未送信イベント数を取得（主にテスト・検証用）
   */
  get queueLength(): number {
    return this.queue.length;
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log("error", message, data, error);
  }

  private formatError(err: unknown): Record<string, unknown> | string | undefined {
    if (err === undefined || err === null) {
      return undefined;
    }
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    }
    if (typeof err === "object") {
      return err as Record<string, unknown>;
    }
    return String(err);
  }

  private outputToConsole(
    level: "info" | "warn" | "error",
    message: string,
    error?: Record<string, unknown> | string,
    data?: Record<string, unknown>
  ): void {
    if (this.options?.stdout === false) {
      return;
    }

    const prefix = `[${this.appName}] [${level.toUpperCase()}]`;
    const extraArgs: unknown[] = [];
    if (error !== undefined) {
      extraArgs.push(error);
    }
    if (data !== undefined) {
      extraArgs.push(data);
    }

    switch (level) {
      case "info":
        if (extraArgs.length > 0) {
          console.info(`${prefix} ${message}`, ...extraArgs);
        } else {
          console.info(`${prefix} ${message}`);
        }
        break;
      case "warn":
        if (extraArgs.length > 0) {
          console.warn(`${prefix} ${message}`, ...extraArgs);
        } else {
          console.warn(`${prefix} ${message}`);
        }
        break;
      case "error":
        if (extraArgs.length > 0) {
          console.error(`${prefix} ${message}`, ...extraArgs);
        } else {
          console.error(`${prefix} ${message}`);
        }
        break;
    }
  }

  private log(
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
    rawError?: unknown
  ): void {
    const errorFormatted = this.formatError(rawError);

    // コンソール出力
    this.outputToConsole(level, message, errorFormatted, data);

    // AXIOM_TOKEN 未設定時はコンソール出力のみに安全にフォールバック
    const token = this.token;
    if (!token) {
      return;
    }

    const event: LogEvent = {
      _time: new Date().toISOString(),
      app: this.appName,
      level,
      message,
    };

    if (data && Object.keys(data).length > 0) {
      event.data = data;
    }
    if (errorFormatted !== undefined) {
      event.error = errorFormatted;
    }

    this.queue.push(event);

    const batchSize = this.options?.batchSize ?? 50;
    if (this.queue.length >= batchSize) {
      this.flush().catch((err) => {
        console.error(`[${this.appName}] [ERROR] Failed to auto-flush logs to Axiom:`, err);
      });
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.timer !== null) {
      return;
    }

    const interval = this.options?.flushIntervalMs ?? 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((err) => {
        console.error(`[${this.appName}] [ERROR] Failed to flush logs to Axiom:`, err);
      });
    }, interval);

    // プロセス終了をブロックしないように unrefTimer を呼ぶ
    try {
      const timerId = this.timer;
      if (timerId !== null && typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
        Deno.unrefTimer(timerId);
      }
    } catch {
      // ignore
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const token = this.token;
    if (!token) {
      this.queue = [];
      return;
    }

    const eventsToSend = [...this.queue];
    this.queue = [];

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventsToSend),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error(
          `[${this.appName}] [ERROR] Axiom ingest failed with HTTP ${response.status}: ${errorBody}`
        );
      }
    } catch (err) {
      console.error(
        `[${this.appName}] [ERROR] Axiom ingest network error:`,
        err
      );
    }
  }
}

export const logger = new Logger("pokemon-champions-reg");
