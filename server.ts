// ポケモンチャンピオンズ ランクバトルお知らせ収集サーバー (Hono版)
// 実行方法: deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv server.ts

import { Hono } from "hono";
import "@std/dotenv/load";
import { PokemonChampionsScraper } from "./scraper.ts";
import type { RankBattleNews, PokemonInfo } from "./types.ts";
import { logger } from "./logger.ts";

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
    logger.info("スクレイピング処理を開始します");

    // コンソール出力をキャプチャするための配列
    const logs: string[] = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    // コンソールメソッドをオーバーライドしてログをキャプチャ
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };
    console.info = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalInfo(...args);
    };
    console.warn = (...args: unknown[]) => {
      logs.push("[WARN] " + args.join(" "));
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      logs.push("[ERROR] " + args.join(" "));
      originalError(...args);
    };

    try {
      await scraper.scrapeAll();
    } finally {
      // 元に戻す
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }

    logger.info("スクレイピング処理が完了しました");

    return c.json({
      success: true,
      message: "スクレイピングが完了しました",
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("スクレイピング処理でエラーが発生しました", error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
    await logger.flush();
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

    logger.info("保存済みニュース一覧を取得しました", { count: newsList.length });

    return c.json({
      success: true,
      count: newsList.length,
      data: newsList,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("保存済みニュース一覧の取得に失敗しました", error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
    await logger.flush();
  }
});

// すべての情報をまとめた単一JSON取得エンドポイント
app.get("/api/json", async (c) => {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);

  try {
    const allData = await scraper.generateAllDataJson();
    logger.info("単一JSONデータを取得しました");
    return c.json({
      success: true,
      data: allData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("単一JSONデータの取得に失敗しました", error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
    await logger.flush();
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
      logger.warn(`レギュレーション ${regulation} のポケモンリストが見つかりません`, { regulation });
      return c.json(
        {
          success: false,
          error: `レギュレーション ${regulation} のポケモンリストが見つかりません。先にスクレイピングを実行するか、正しいレギュレーション名を指定してください。`,
        },
        404
      );
    }

    // レギュレーションのソースURLを探す
    let url = "";
    const newsEntries = kv.list<RankBattleNews>({ prefix: ["news"] });
    for await (const entry of newsEntries) {
      if (entry.value.regulation === regulation && entry.value.pokemonLink) {
        url = entry.value.pokemonLink;
        break;
      }
    }

    logger.info(`レギュレーション ${regulation} のポケモンリストを取得しました`, {
      regulation,
      count: result.value.length,
    });

    return c.json({
      success: true,
      regulation,
      url,
      count: result.value.length,
      data: result.value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`レギュレーション ${regulation} のポケモンリスト取得に失敗しました`, error, { regulation });
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
    await logger.flush();
  }
});

// すべてのレギュレーションのポケモンリスト取得エンドポイント
app.get("/api/pokemon", async (c) => {
  const kv = await Deno.openKv();

  try {
    // レギュレーション名 -> url のマップを作成
    const regulationUrlMap: { [key: string]: string } = {};
    const newsEntries = kv.list<RankBattleNews>({ prefix: ["news"] });
    for await (const entry of newsEntries) {
      if (entry.value.regulation && entry.value.pokemonLink) {
        regulationUrlMap[entry.value.regulation] = entry.value.pokemonLink;
      }
    }

    const entries = kv.list<PokemonInfo[]>({ prefix: ["regulation_pokemon"] });
    const result: { [key: string]: { url: string, pokemons: PokemonInfo[] } } = {};

    for await (const entry of entries) {
      const regulation = entry.key[1] as string;
      result[regulation] = {
        url: regulationUrlMap[regulation] || "",
        pokemons: entry.value
      };
    }

    logger.info("全レギュレーションのポケモンリストを取得しました", {
      regulationsCount: Object.keys(result).length,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("全レギュレーションのポケモンリスト取得に失敗しました", error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
    await logger.flush();
  }
});

// Netlifyデプロイエンドポイント
app.post("/api/deploy", async (c) => {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);

  try {
    logger.info("Netlifyへのデプロイリクエストを受信しました");

    // コンソール出力をキャプチャするための配列
    const logs: string[] = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    // コンソールメソッドをオーバーライド
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };
    console.info = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalInfo(...args);
    };
    console.warn = (...args: unknown[]) => {
      logs.push("[WARN] " + args.join(" "));
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      logs.push("[ERROR] " + args.join(" "));
      originalError(...args);
    };

    try {
      await scraper.deployToNetlify();
    } finally {
      // 元に戻す
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }

    logger.info("Netlifyへのデプロイ処理が完了しました");

    return c.json({
      success: true,
      message: "Netlifyへのデプロイが完了しました",
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Netlifyへのデプロイ処理に失敗しました", error);
    return c.json(
      {
        success: false,
        error: message,
      },
      500
    );
  } finally {
    kv.close();
    await logger.flush();
  }
});

// サーバー起動
const port = parseInt(Deno.env.get("PORT") || "8000");
logger.info(`🚀 サーバーを起動しています: http://localhost:${port}`, { port });

Deno.serve({ port }, app.fetch);
