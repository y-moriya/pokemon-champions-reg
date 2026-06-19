// ポケモンチャンピオンズ ランクバトルお知らせ収集サーバー (Hono版)
// 実行方法: deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv server.ts

import { Hono } from "hono";
import "@std/dotenv/load";
import { PokemonChampionsScraper } from "./scraper.ts";
import type { RankBattleNews, PokemonInfo } from "./types.ts";

const app = new Hono();

// ルートエンドポイント
app.get("/", (c) => {
  return c.json({
    message: "ポケモンチャンピオンズ ランクバトルお知らせ収集API",
    endpoints: {
      "POST /api/scrape": "スクレイピング実行",
      "GET /api/list": "保存済みニュース一覧取得",
      "GET /api/json": "すべての情報をまとめた単一JSON取得",
      "GET /api/pokemon": "すべてのレギュレーション of ポケモンリスト取得",
      "GET /api/pokemon/:regulation": "指定レギュレーションのポケモンリスト取得",
      "POST /api/deploy": "NetlifyへのデプロイStarサーバーを実行",
    },
  });
});

// スクレイピング実行エンドポイント
app.post("/api/scrape", async (c) => {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);

  try {
    // コンソール出力をキャプチャするための配列
    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    // console.logとconsole.errorをオーバーライド
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };
    console.error = (...args: unknown[]) => {
      logs.push("[ERROR] " + args.join(" "));
      originalError(...args);
    };

    await scraper.scrapeAll();

    // console.logとconsole.errorを元に戻す
    console.log = originalLog;
    console.error = originalError;

    return c.json({
      success: true,
      message: "スクレイピングが完了しました",
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
  }
});

// 保存済みニュース一覧取得エンドポイント
app.get("/api/list", async (c) => {
  const kv = await Deno.openKv();

  try {
    const entries = kv.list<RankBattleNews>({ prefix: ["news"] });
    const newsList: RankBattleNews[] = [];

    for await (const entry of entries) {
      newsList.push(entry.value);
    }

    // シーズン名でソート（自然順ソート）
    newsList.sort((a, b) => a.season.localeCompare(b.season, undefined, { numeric: true, sensitivity: 'base' }));

    return c.json({
      success: true,
      count: newsList.length,
      data: newsList,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
  }
});

// すべての情報をまとめた単一JSON取得エンドポイント
app.get("/api/json", async (c) => {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);

  try {
    const allData = await scraper.generateAllDataJson();
    return c.json({
      success: true,
      data: allData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
  }
});

// レギュレーションごとのポケモンリスト取得エンドポイント
app.get("/api/pokemon/:regulation", async (c) => {
  const regulation = c.req.param("regulation");
  const kv = await Deno.openKv();

  try {
    const result = await kv.get<PokemonInfo[]>([
      "regulation_pokemon",
      regulation,
    ]);

    if (result.value === null) {
      return c.json(
        {
          success: false,
          error: `レギュレーション ${regulation} のポケモンリストが見つかりません。先にスクレイピングを実行するか、正しいレギュレーション名を指定してください。`,
        },
        404
      );
    }

    return c.json({
      success: true,
      regulation,
      count: result.value.length,
      data: result.value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
  }
});

// すべてのレギュレーションのポケモンリスト取得エンドポイント
app.get("/api/pokemon", async (c) => {
  const kv = await Deno.openKv();

  try {
    const entries = kv.list<PokemonInfo[]>({ prefix: ["regulation_pokemon"] });
    const result: { [key: string]: PokemonInfo[] } = {};

    for await (const entry of entries) {
      const regulation = entry.key[1] as string;
      result[regulation] = entry.value;
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
  }
});

// Netlifyデプロイエンドポイント
app.post("/api/deploy", async (c) => {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);

  try {
    // コンソール出力をキャプチャするための配列
    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    // console.logとconsole.errorをオーバーライド
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };
    console.error = (...args: unknown[]) => {
      logs.push("[ERROR] " + args.join(" "));
      originalError(...args);
    };

    await scraper.deployToNetlify();

    // console.logとconsole.errorを元に戻す
    console.log = originalLog;
    console.error = originalError;

    return c.json({
      success: true,
      message: "Netlifyへのデプロイが完了しました",
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
  }
});

// サーバー起動
const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`🚀 サーバーを起動しています: http://localhost:${port}`);

Deno.serve({ port }, app.fetch);
