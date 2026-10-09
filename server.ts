// ポケモンチャンピオンズ ランクバトルお知らせ収集サーバー (Cloudflare Workers / Hono)

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, RankBattleNews, PokemonInfo } from "./types.ts";
import { PokemonChampionsScraper } from "./scraper.ts";
import { logger } from "./logger.ts";

const app = new Hono<{ Bindings: Env }>();

// CORS設定
app.use("*", cors());

// ミドルウェア: 環境変数をロガーに設定
app.use("*", async (c, next) => {
  logger.setEnv(c.env);
  await next();
});

// ルートエンドポイント
app.get("/", (c) => {
  return c.json({
    message: "ポケモンチャンピオンズ ランクバトルお知らせ収集API (Cloudflare Workers)",
    endpoints: {
      "POST /api/scrape": "スクレイピング実行",
      "GET /api/list": "保存済みニュース一覧取得",
      "GET /api/json": "すべての情報をまとめた単一JSON取得",
      "GET /api/pokemon": "すべてのレギュレーション of ポケモンリスト取得",
      "GET /api/pokemon/:regulation": "指定レギュレーションのポケモンリスト取得",
      "POST /api/deploy": "Netlifyへのデプロイを実行",
    },
  });
});

// スクレイピング実行エンドポイント
app.post("/api/scrape", async (c) => {
  const scraper = new PokemonChampionsScraper(c.env.KV, c.env);

  try {
    logger.info("スクレイピング処理を開始します");

    const logs: string[] = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

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
    if (c.executionCtx) {
      c.executionCtx.waitUntil(logger.flush());
    } else {
      await logger.flush();
    }
  }
});

// 保存済みニュース一覧取得エンドポイント
app.get("/api/list", async (c) => {
  const scraper = new PokemonChampionsScraper(c.env.KV, c.env);

  try {
    const newsList = await scraper.getAllSavedNews();
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
    if (c.executionCtx) {
      c.executionCtx.waitUntil(logger.flush());
    } else {
      await logger.flush();
    }
  }
});

// すべての情報をまとめた単一JSON取得エンドポイント
app.get("/api/json", async (c) => {
  const scraper = new PokemonChampionsScraper(c.env.KV, c.env);

  try {
    // キャッシュをチェック
    const cached = await c.env.KV.get("all_data");
    if (cached) {
      logger.info("キャッシュから単一JSONデータを取得しました");
      return c.json({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const allData = await scraper.generateAllDataJson();
    logger.info("単一JSONデータを生成・取得しました");
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
    if (c.executionCtx) {
      c.executionCtx.waitUntil(logger.flush());
    } else {
      await logger.flush();
    }
  }
});

// レギュレーションごとのポケモンリスト取得エンドポイント
app.get("/api/pokemon/:regulation", async (c) => {
  const regulation = c.req.param("regulation");

  try {
    const pokemonsRaw = await c.env.KV.get(`regulation_pokemon:${regulation}`);

    if (pokemonsRaw === null) {
      logger.warn(`レギュレーション ${regulation} のポケモンリストが見つかりません`, { regulation });
      return c.json(
        {
          success: false,
          error: `レギュレーション ${regulation} のポケモンリストが見つかりません。先にスクレイピングを実行するか、正しいレギュレーション名を指定してください。`,
        },
        404
      );
    }

    const pokemons: PokemonInfo[] = JSON.parse(pokemonsRaw);

    // ソースURLの取得
    let url = "";
    const scraper = new PokemonChampionsScraper(c.env.KV, c.env);
    const newsList = await scraper.getAllSavedNews();
    for (const item of newsList) {
      if (item.regulation === regulation && item.pokemonLink) {
        url = item.pokemonLink;
        break;
      }
    }

    logger.info(`レギュレーション ${regulation} のポケモンリストを取得しました`, {
      regulation,
      count: pokemons.length,
    });

    return c.json({
      success: true,
      regulation,
      url,
      count: pokemons.length,
      data: pokemons,
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
    if (c.executionCtx) {
      c.executionCtx.waitUntil(logger.flush());
    } else {
      await logger.flush();
    }
  }
});

// すべてのレギュレーションのポケモンリスト取得エンドポイント
app.get("/api/pokemon", async (c) => {
  try {
    const scraper = new PokemonChampionsScraper(c.env.KV, c.env);
    const allData = await scraper.generateAllDataJson();

    logger.info("全レギュレーションのポケモンリストを取得しました", {
      regulationsCount: Object.keys(allData.regulations).length,
    });

    return c.json({
      success: true,
      data: allData.regulations,
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
    if (c.executionCtx) {
      c.executionCtx.waitUntil(logger.flush());
    } else {
      await logger.flush();
    }
  }
});

// Netlifyデプロイエンドポイント
app.post("/api/deploy", async (c) => {
  const scraper = new PokemonChampionsScraper(c.env.KV, c.env);

  try {
    logger.info("Netlifyへのデプロイリクエストを受信しました");

    const logs: string[] = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

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
    if (c.executionCtx) {
      c.executionCtx.waitUntil(logger.flush());
    } else {
      await logger.flush();
    }
  }
});

// Cloudflare Workers エクスポート（fetch & scheduled）
export default {
  fetch: app.fetch,
  async scheduled(event: { cron: string }, env: Env, ctx: ExecutionContext) {
    logger.setEnv(env);
    logger.info("定期スクレイピング (Scheduled Cron) を開始します", { cron: event.cron });
    const scraper = new PokemonChampionsScraper(env.KV, env);
    try {
      await scraper.scrapeAll();
      logger.info("定期スクレイピングが完了しました");
    } catch (error) {
      logger.error("定期スクレイピング中にエラーが発生しました", error);
    } finally {
      ctx.waitUntil(logger.flush());
    }
  },
};
