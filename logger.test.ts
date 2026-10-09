import { assertEquals, assertExists } from "@std/assert";
import { Logger, logger } from "./logger.ts";

Deno.test("Logger - デフォルトでエクスポートされた logger インスタンスの検証", () => {
  assertEquals(logger.appName, "pokemon-champions-reg");
});

Deno.test("Logger - トークン未設定時のコンソールフォールバック動作のテスト", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchCalled = true;
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  const logs: { level: string; args: unknown[] }[] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.info = (...args: unknown[]) => {
    logs.push({ level: "info", args });
  };
  console.warn = (...args: unknown[]) => {
    logs.push({ level: "warn", args });
  };
  console.error = (...args: unknown[]) => {
    logs.push({ level: "error", args });
  };

  try {
    // token が未設定（undefined または空文字）のインスタンス
    const testLogger = new Logger("test-app", { token: undefined });

    testLogger.info("テスト情報メッセージ", { userId: 123 });
    testLogger.warn("テスト警告メッセージ", { warningCode: "W01" });
    testLogger.error("テストエラーメッセージ", new Error("Something went wrong"), { detail: "failed" });

    // コンソール出力が呼ばれていることを確認
    assertEquals(logs.length, 3);
    assertEquals(logs[0].level, "info");
    assertEquals(logs[0].args[0], "[test-app] [INFO] テスト情報メッセージ");
    assertEquals(logs[0].args[1], { userId: 123 });

    assertEquals(logs[1].level, "warn");
    assertEquals(logs[1].args[0], "[test-app] [WARN] テスト警告メッセージ");
    assertEquals(logs[1].args[1], { warningCode: "W01" });

    assertEquals(logs[2].level, "error");
    assertEquals(logs[2].args[0], "[test-app] [ERROR] テストエラーメッセージ");

    // トークン未設定のためキューには入らない
    assertEquals(testLogger.queueLength, 0);

    // flush() を呼んでも fetch は呼ばれない
    await testLogger.flush();
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

Deno.test("Logger - トークンが空文字列の場合もフォールバックすることのテスト", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchCalled = true;
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  try {
    const testLogger = new Logger("test-app", { token: "", stdout: false });
    testLogger.info("空文字トークン時のメッセージ");

    assertEquals(testLogger.queueLength, 0);
    await testLogger.flush();
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Logger - トークン設定時の Axiom 送信用ペイロードの検証テスト", async () => {
  let capturedUrl = "";
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody = "";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = init?.headers;
    capturedBody = String(init?.body);
    return Promise.resolve(new Response(JSON.stringify({ ingested: 1 }), { status: 200 }));
  };

  try {
    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-axiom-token",
      dataset: "personal-apps",
      stdout: false, // テスト出力抑制
    });

    testLogger.info("データ取得に成功しました", { count: 42, target: "seasons" });
    assertEquals(testLogger.queueLength, 1);

    await testLogger.flush();

    // fetch 送信後の検証
    assertEquals(testLogger.queueLength, 0);
    assertEquals(
      capturedUrl,
      "https://api.axiom.co/v1/datasets/personal-apps/ingest"
    );

    const headers = capturedHeaders as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer test-axiom-token");
    assertEquals(headers["Content-Type"], "application/json");

    const payload = JSON.parse(capturedBody);
    assertEquals(Array.isArray(payload), true);
    assertEquals(payload.length, 1);

    const event = payload[0];
    assertEquals(event.app, "pokemon-champions-reg");
    assertEquals(event.level, "info");
    assertEquals(event.message, "データ取得に成功しました");
    assertEquals(event.data, { count: 42, target: "seasons" });
    assertExists(event._time);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Logger - エラーオブジェクトと構造化メタデータの送信テスト", async () => {
  let capturedBody = "";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = String(init?.body);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  try {
    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-token",
      dataset: "personal-apps",
      stdout: false,
    });

    const error = new Error("接続に失敗しました");
    testLogger.error("スクレイピング処理で例外発生", error, { url: "https://example.com" });

    await testLogger.flush();

    const payload = JSON.parse(capturedBody);
    assertEquals(payload.length, 1);
    const event = payload[0];
    assertEquals(event.app, "pokemon-champions-reg");
    assertEquals(event.level, "error");
    assertEquals(event.message, "スクレイピング処理で例外発生");
    assertEquals(event.data, { url: "https://example.com" });
    assertEquals(event.error.name, "Error");
    assertEquals(event.error.message, "接続に失敗しました");
    assertExists(event.error.stack);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Logger - 複数ログのバッチフラッシュテスト", async () => {
  let capturedBody = "";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = String(init?.body);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  try {
    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-token",
      dataset: "personal-apps",
      stdout: false,
    });

    testLogger.info("1件目のログ");
    testLogger.warn("2件目のログ");
    testLogger.error("3件目のログ");

    assertEquals(testLogger.queueLength, 3);
    await testLogger.flush();
    assertEquals(testLogger.queueLength, 0);

    const payload = JSON.parse(capturedBody);
    assertEquals(payload.length, 3);
    assertEquals(payload[0].message, "1件目のログ");
    assertEquals(payload[1].message, "2件目のログ");
    assertEquals(payload[2].message, "3件目のログ");

    // 再度 flush しても空キューなので fetch されない
    capturedBody = "";
    await testLogger.flush();
    assertEquals(capturedBody, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Logger - Axiom 送信障害時の安全フォールバック（例外をスローしない）", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.reject(new TypeError("Network error"));
  };

  try {
    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-token",
      dataset: "personal-apps",
      stdout: false,
    });

    testLogger.info("ログ送信テスト");

    // fetch が reject されても例外が伝播せず resolve すること
    await testLogger.flush();
    assertEquals(testLogger.queueLength, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Logger - 環境変数からの設定読み込みテスト (環境変数アクセス権限がある場合)", async () => {
  let canAccessEnv = false;
  try {
    if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
      Deno.env.get("NON_EXISTENT_VAR_FOR_TEST");
      canAccessEnv = true;
    }
  } catch {
    canAccessEnv = false;
  }

  if (!canAccessEnv) {
    // 環境変数へのアクセス権限がない場合はスキップ
    return;
  }

  const prevToken = Deno.env.get("AXIOM_TOKEN");
  const prevDataset = Deno.env.get("AXIOM_DATASET");

  let capturedUrl = "";
  let capturedHeaders: HeadersInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = init?.headers;
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };

  try {
    Deno.env.set("AXIOM_TOKEN", "env-injected-token");
    Deno.env.set("AXIOM_DATASET", "env-dataset");

    const envLogger = new Logger("pokemon-champions-reg", { stdout: false });
    envLogger.info("環境変数読み込みテスト");
    await envLogger.flush();

    assertEquals(capturedUrl, "https://api.axiom.co/v1/datasets/env-dataset/ingest");
    const headers = capturedHeaders as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer env-injected-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevToken !== undefined) {
      Deno.env.set("AXIOM_TOKEN", prevToken);
    } else {
      Deno.env.delete("AXIOM_TOKEN");
    }
    if (prevDataset !== undefined) {
      Deno.env.set("AXIOM_DATASET", prevDataset);
    } else {
      Deno.env.delete("AXIOM_DATASET");
    }
  }
});
