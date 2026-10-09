import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, logger } from "./logger.ts";

describe("Logger", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("デフォルトでエクスポートされた logger インスタンスの検証", () => {
    expect(logger.appName).toBe("pokemon-champions-reg");
  });

  it("トークン未設定時のコンソールフォールバック動作のテスト", async () => {
    let fetchCalled = false;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const testLogger = new Logger("test-app", { token: undefined });

    testLogger.info("テスト情報メッセージ", { userId: 123 });
    testLogger.warn("テスト警告メッセージ", { warningCode: "W01" });
    testLogger.error("テストエラーメッセージ", new Error("Something went wrong"), { detail: "failed" });

    expect(infoSpy).toHaveBeenCalledWith("[test-app] [INFO] テスト情報メッセージ", { userId: 123 });
    expect(warnSpy).toHaveBeenCalledWith("[test-app] [WARN] テスト警告メッセージ", { warningCode: "W01" });
    expect(errorSpy).toHaveBeenCalled();

    // トークン未設定のためキューには入らない
    expect(testLogger.queueLength).toBe(0);

    // flush() を呼んでも fetch は呼ばれない
    await testLogger.flush();
    expect(fetchCalled).toBe(false);
  });

  it("トークンが空文字列の場合もフォールバックすることのテスト", async () => {
    let fetchCalled = false;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    const testLogger = new Logger("test-app", { token: "", stdout: false });
    testLogger.info("空文字トークン時のメッセージ");

    expect(testLogger.queueLength).toBe(0);
    await testLogger.flush();
    expect(fetchCalled).toBe(false);
  });

  it("トークン設定時の Axiom 送信用ペイロードの検証テスト", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      capturedBody = String(init?.body);
      return Promise.resolve(new Response(JSON.stringify({ ingested: 1 }), { status: 200 }));
    });

    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-axiom-token",
      dataset: "personal-apps",
      stdout: false,
    });

    testLogger.info("データ取得に成功しました", { count: 42, target: "seasons" });
    expect(testLogger.queueLength).toBe(1);

    await testLogger.flush();

    expect(testLogger.queueLength).toBe(0);
    expect(capturedUrl).toBe("https://api.axiom.co/v1/datasets/personal-apps/ingest");

    const headers = capturedHeaders as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-axiom-token");
    expect(headers["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(capturedBody);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(1);

    const event = payload[0];
    expect(event.app).toBe("pokemon-champions-reg");
    expect(event.level).toBe("info");
    expect(event.message).toBe("データ取得に成功しました");
    expect(event.data).toEqual({ count: 42, target: "seasons" });
    expect(event._time).toBeDefined();
  });

  it("エラーオブジェクトと構造化メタデータの送信テスト", async () => {
    let capturedBody = "";

    globalThis.fetch = vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-token",
      dataset: "personal-apps",
      stdout: false,
    });

    const error = new Error("接続に失敗しました");
    testLogger.error("スクレイピング処理で例外発生", error, { url: "https://example.com" });

    await testLogger.flush();

    const payload = JSON.parse(capturedBody);
    expect(payload.length).toBe(1);
    const event = payload[0];
    expect(event.app).toBe("pokemon-champions-reg");
    expect(event.level).toBe("error");
    expect(event.message).toBe("スクレイピング処理で例外発生");
    expect(event.data).toEqual({ url: "https://example.com" });
    expect(event.error.name).toBe("Error");
    expect(event.error.message).toBe("接続に失敗しました");
    expect(event.error.stack).toBeDefined();
  });

  it("複数ログのバッチフラッシュテスト", async () => {
    let capturedBody = "";

    globalThis.fetch = vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-token",
      dataset: "personal-apps",
      stdout: false,
    });

    testLogger.info("1件目のログ");
    testLogger.warn("2件目のログ");
    testLogger.error("3件目のログ");

    expect(testLogger.queueLength).toBe(3);
    await testLogger.flush();
    expect(testLogger.queueLength).toBe(0);

    const payload = JSON.parse(capturedBody);
    expect(payload.length).toBe(3);
    expect(payload[0].message).toBe("1件目のログ");
    expect(payload[1].message).toBe("2件目のログ");
    expect(payload[2].message).toBe("3件目のログ");

    // 再度 flush しても空キューなので fetch されない
    capturedBody = "";
    await testLogger.flush();
    expect(capturedBody).toBe("");
  });

  it("Axiom 送信障害時の安全フォールバック（例外をスローしない）", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new TypeError("Network error"));
    });

    const testLogger = new Logger("pokemon-champions-reg", {
      token: "test-token",
      dataset: "personal-apps",
      stdout: false,
    });

    testLogger.info("ログ送信テスト");

    // fetch が reject されても例外が伝播せず resolve すること
    await testLogger.flush();
    expect(testLogger.queueLength).toBe(0);
  });

  it("動的環境変数注入のテスト (setEnv)", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const testLogger = new Logger("pokemon-champions-reg", { stdout: false });
    testLogger.setEnv({
      AXIOM_TOKEN: "dynamic-injected-token",
      AXIOM_DATASET: "dynamic-dataset",
    });

    testLogger.info("動的環境変数テスト");
    await testLogger.flush();

    expect(capturedUrl).toBe("https://api.axiom.co/v1/datasets/dynamic-dataset/ingest");
    const headers = capturedHeaders as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer dynamic-injected-token");
  });
});
