// ポケモンチャンピオンズ ランクバトルお知らせ収集 - スクレイパークラス

import { DOMParser } from "@b-fuze/deno-dom";
import type { NewsListItem, NewsListData, RankBattleNews, PokemonInfo } from "./types.ts";
import { LIST_JSON_URL, BASE_URL } from "./constants.ts";
import { logger } from "./logger.ts";

export class PokemonChampionsScraper {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  // ページが既に取得済みかチェック
  async isAlreadyFetched(url: string): Promise<boolean> {
    const result = await this.kv.get<RankBattleNews>(["news", url]);
    return result.value !== null;
  }

  // ニュースを保存
  async saveNews(news: RankBattleNews): Promise<void> {
    await this.kv.set(["news", news.url], news);
    logger.info(`保存しました: ${news.title}`, {
      title: news.title,
      url: news.url,
      season: news.season,
      regulation: news.regulation,
    });
  }

  // JSONからお知らせ一覧を取得
  async fetchNewsList(): Promise<NewsListItem[]> {
    logger.info(`お知らせ一覧JSONを取得中: ${LIST_JSON_URL}`, { url: LIST_JSON_URL });

    try {
      const response = await fetch(LIST_JSON_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const jsonData: NewsListData = await response.json();
      logger.info(`お知らせ一覧を取得完了: ${jsonData.data.length}件`, { count: jsonData.data.length });

      return jsonData.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`お知らせ一覧の取得に失敗: ${message}`, error, { url: LIST_JSON_URL });
      return [];
    }
  }

  // ランクバトルのお知らせのみをフィルタリング
  filterRankBattleNews(newsList: NewsListItem[]): NewsListItem[] {
    // ポケモンチャンピオンズではタイトルが「「ランクバトル シーズンM-N」開催中！」などの形式
    // ※スペースが含まれることがあるため \s* を追加
    const titlePattern = /^「ランクバトル シーズン(?:[A-Z]-)?\d+」\s*開催中！$/;
    
    const filtered = newsList.filter((item) => {
      const isRankBattle = item.kindTxt === "ランクバトル" && 
                           (String(item.infoKind) === "11" || item.kind === "11" || item.kind === "2");
      return isRankBattle && titlePattern.test(item.title);
    });

    logger.info(`フィルタリング結果: ${filtered.length}件のランクバトルシーズン告知を発見`, {
      matchedCount: filtered.length,
      totalCount: newsList.length,
    });
    return filtered;
  }

  // シーズン名を抽出（例: "シーズンM-2" → "M-2"）
  private extractSeason(text: string): string | null {
    const seasonMatch = text.match(/シーズン([A-Za-z]+-\d+|\d+)/);
    if (seasonMatch && seasonMatch[1]) {
      return seasonMatch[1];
    }
    return null;
  }

  // レギュレーションを抽出（例: "レギュレーションM-A" → "M-A"）
  private extractRegulation(text: string): string | null {
    const regulationMatch = text.match(/レギュレーション([A-ZＡ-Ｚ]-[A-ZＡ-Ｚ]|[A-ZＡ-Ｚ])/);
    if (regulationMatch && regulationMatch[1]) {
      const letter = regulationMatch[1];
      // 全角英字・全角ハイフンを半角に変換
      const normalized = letter.replace(/[Ａ-Ｚ]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                               .replace(/－/g, "-");
      return normalized;
    }
    return null;
  }

  // 開催期間を抽出（例: "2026年5月13日（水）～6月17日（水）10:59"）
  private extractDates(text: string): { startAt: string; endAt: string } | null {
    const regex = /(\d{4})年(\d{1,2})月(\d{1,2})日（[^）]+）～(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日（[^）]+）(\d{1,2}):(\d{2})/;
    const match = text.match(regex);
    
    if (match) {
      const startYear = match[1];
      const startMonth = match[2].padStart(2, '0');
      const startDay = match[3].padStart(2, '0');
      
      const endYear = match[4] || startYear;
      const endMonth = match[5].padStart(2, '0');
      const endDay = match[6].padStart(2, '0');
      const endHour = match[7].padStart(2, '0');
      const endMinute = match[8].padStart(2, '0');
      
      return {
        startAt: `${startYear}-${startMonth}-${startDay}`,
        endAt: `${endYear}-${endMonth}-${endDay}T${endHour}:${endMinute}:00`
      };
    }
    
    return null;
  }

  // 個別ページから情報を抽出
  async extractPageContent(newsItem: NewsListItem): Promise<RankBattleNews | null> {
    const url = `${BASE_URL}/${newsItem.link}`;
    logger.info(`個別ページを取得中: ${url}`, { url, title: newsItem.title });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc) {
        throw new Error("HTMLの解析に失敗しました");
      }

      // メインテキストを取得（ポケモンチャンピオンズの div.article-body に対応）
      const mainTextElement = doc.querySelector("div.article-body") || doc.querySelector("article") || doc.querySelector("div.main-text");
      const mainText = mainTextElement?.textContent || "";

      // シーズン、レギュレーション、開催期間を抽出
      const season = this.extractSeason(mainText);
      const regulation = this.extractRegulation(mainText);
      const dates = this.extractDates(mainText);

      // シーズンまたはレギュレーションが取得できない場合はスキップ
      if (season === null || regulation === null) {
        logger.warn(`スキップ（シーズンまたはレギュレーションが見つかりません）: ${newsItem.title}`, { url, title: newsItem.title });
        return null;
      }

      // 「参加できるポケモン」のリンクを取得
      const pokemonLinkElement = Array.from(doc.querySelectorAll("a")).find(
        (el) => el.textContent?.trim() === "参加できるポケモン"
      );
      let pokemonLink: string | undefined = undefined;
      if (pokemonLinkElement) {
        const href = pokemonLinkElement.getAttribute("href");
        if (href) {
          pokemonLink = href.startsWith("http") ? href : new URL(href, url).href;
        }
      }

      logger.info(`個別ページの解析完了: ${newsItem.title}`, {
        url,
        title: newsItem.title,
        season,
        regulation,
        startAt: dates?.startAt,
        endAt: dates?.endAt,
        pokemonLink,
      });

      return {
        url,
        title: newsItem.title,
        season,
        regulation,
        pokemonLink,
        startAt: dates?.startAt,
        endAt: dates?.endAt,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`個別ページの取得に失敗: ${message}`, error, { url, title: newsItem.title });
      return null;
    }
  }

  // ポケモンリストページからポケモン一覧を取得
  async fetchPokemonList(url: string): Promise<PokemonInfo[]> {
    logger.info(`ポケモンリストを取得中: ${url}`, { url });
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const match = html.match(/const pokemons\s*=\s*(\[[\s\S]*?\]);/);
      if (!match) {
        throw new Error("HTMLから pokemons 変数が見つかりませんでした");
      }

      const rawList = JSON.parse(match[1]);
      const pokemonList: PokemonInfo[] = [];
      for (const item of rawList) {
        if (Array.isArray(item) && item.length >= 2) {
          const id = item[0];
          const name = item.length >= 3 ? item[2] : item[1];
          if (typeof id === "string" && typeof name === "string") {
            pokemonList.push({ id, name });
          }
        }
      }
      return pokemonList;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`ポケモンリストの取得に失敗: ${message}`, error, { url });
      return [];
    }
  }

  // すべてのランクバトルお知らせを収集
  async scrapeAll(): Promise<void> {
    logger.info("ランクバトルお知らせの収集を開始します");

    let newCount = 0;
    let skipCount = 0;
    let invalidCount = 0;

    // JSONから一覧を取得
    const newsList = await this.fetchNewsList();
    if (newsList.length === 0) {
      logger.error("お知らせ一覧の取得に失敗しました");
      return;
    }

    // ランクバトルのお知らせのみをフィルタリング
    const rankBattleNews = this.filterRankBattleNews(newsList);

    if (rankBattleNews.length === 0) {
      logger.warn("該当するランクバトルシーズン告知が見つかりませんでした");
      return;
    }

    // 各お知らせを処理
    for (const newsItem of rankBattleNews) {
      const url = `${BASE_URL}/${newsItem.link}`;

      // 既に取得済みかチェック
      if (await this.isAlreadyFetched(url)) {
        const existingNews = (await this.kv.get<RankBattleNews>(["news", url])).value;
        const hasPokemonLink = existingNews && existingNews.pokemonLink;
        const hasDates = existingNews && existingNews.startAt && existingNews.endAt;
        
        let hasPokemonList = false;
        if (existingNews && existingNews.regulation) {
          const pokemonListCheck = await this.kv.get<PokemonInfo[]>(["regulation_pokemon", existingNews.regulation]);
          hasPokemonList = pokemonListCheck.value !== null;
        }

        // すでに取得済みで、かつポケモンリスト、リンク、開催期間がすべて保存されている場合は完全にスキップする
        if (hasPokemonList && hasPokemonLink && hasDates) {
          logger.info(`スキップ（取得済み）: ${newsItem.title}`, { title: newsItem.title, url });
          skipCount++;
          continue;
        }

        // 情報が不足している場合は再取得して補完する
        logger.info(`補完処理（情報不足のため再取得）: ${newsItem.title}`, { title: newsItem.title, url });
        const news = await this.extractPageContent(newsItem);
        if (news) {
          await this.saveNews(news);
          if (news.pokemonLink) {
            const pokemonList = await this.fetchPokemonList(news.pokemonLink);
            if (pokemonList.length > 0) {
              await this.kv.set(["regulation_pokemon", news.regulation], pokemonList);
              logger.info(`レギュレーション ${news.regulation} のポケモンリスト（${pokemonList.length}件）を保存しました`, {
                regulation: news.regulation,
                count: pokemonList.length,
              });
            }
          }
          newCount++;
        } else {
          invalidCount++;
        }

        // レート制限対策
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // 新規のお知らせ
      const news = await this.extractPageContent(newsItem);
      if (news) {
        await this.saveNews(news);
        if (news.pokemonLink) {
          const pokemonList = await this.fetchPokemonList(news.pokemonLink);
          if (pokemonList.length > 0) {
            await this.kv.set(["regulation_pokemon", news.regulation], pokemonList);
            logger.info(`レギュレーション ${news.regulation} のポケモンリスト（${pokemonList.length}件）を保存しました`, {
              regulation: news.regulation,
              count: pokemonList.length,
            });
          }
        }
        newCount++;
      } else {
        invalidCount++;
      }

      // レート制限対策: リクエスト間隔を空ける
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info("収集完了", {
      newCount,
      skipCount,
      invalidCount,
    });

    // シーズン→レギュレーションマップを更新
    await this.updateSeasonRegulationMap();
  }

  // 保存済みのニュース一覧を表示
  async listSavedNews(): Promise<void> {
    logger.info("保存済みのランクバトルお知らせ一覧を表示します");

    const entries = this.kv.list<RankBattleNews>({ prefix: ["news"] });
    let count = 0;

    for await (const entry of entries) {
      count++;
      const news = entry.value;
      const pokemonListCheck = await this.kv.get<PokemonInfo[]>(["regulation_pokemon", news.regulation]);
      const pokemonCount = pokemonListCheck.value ? pokemonListCheck.value.length : 0;

      logger.info(`[${count}] ${news.title}`, {
        season: news.season,
        regulation: news.regulation,
        url: news.url,
        pokemonLink: news.pokemonLink,
        startAt: news.startAt,
        endAt: news.endAt,
        pokemonCount,
        fetchedAt: news.fetchedAt,
      });
    }

    if (count === 0) {
      logger.info("まだお知らせは保存されていません");
    }
  }

  // シーズン→レギュレーションマップをKVに保存
  private async updateSeasonRegulationMap(): Promise<void> {
    const entries = this.kv.list<RankBattleNews>({ prefix: ["news"] });
    const seasonRegulationMap: { [key: string]: string } = {};

    for await (const entry of entries) {
      const news = entry.value;
      seasonRegulationMap[news.season] = news.regulation;
    }

    // シーズン名でソート（自然順ソート）
    const sortedSeasons = Object.keys(seasonRegulationMap)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const result: { [key: string]: string } = {};
    for (const season of sortedSeasons) {
      result[season] = seasonRegulationMap[season];
    }

    // KVに保存
    await this.kv.set(["season_regulation_map"], result);
    logger.info("シーズン→レギュレーションマップを更新しました", { count: Object.keys(result).length });
  }

  // 全データを含んだ単一のJSONオブジェクトを生成
  async generateAllDataJson(): Promise<unknown> {
    // 1. シーズン情報の取得
    const newsEntries = this.kv.list<RankBattleNews>({ prefix: ["news"] });
    const seasonsList: RankBattleNews[] = [];
    for await (const entry of newsEntries) {
      seasonsList.push(entry.value);
    }
    // シーズン名でソート
    seasonsList.sort((a, b) => a.season.localeCompare(b.season, undefined, { numeric: true, sensitivity: 'base' }));

    const seasons = seasonsList.map(news => ({
      season: news.season,
      regulation: news.regulation,
      startAt: news.startAt,
      endAt: news.endAt,
      url: news.url
    }));

    // レギュレーション名 -> ポケモンリストURL のマップを作成
    const regulationUrlMap: { [key: string]: string } = {};
    for (const news of seasonsList) {
      if (news.regulation && news.pokemonLink) {
        regulationUrlMap[news.regulation] = news.pokemonLink;
      }
    }

    // 2. レギュレーション別ポケモンリストの取得
    const pokemonEntries = this.kv.list<PokemonInfo[]>({ prefix: ["regulation_pokemon"] });
    const regulations: { [key: string]: { url: string, pokemons: PokemonInfo[] } } = {};
    for await (const entry of pokemonEntries) {
      const regulation = entry.key[1] as string;
      regulations[regulation] = {
        url: regulationUrlMap[regulation] || "",
        pokemons: entry.value
      };
    }

    return {
      seasons,
      regulations
    };
  }

  // シーズン番号とレギュレーションの対応をJSON形式で出力
  async outputJson(): Promise<void> {
    const data = await this.generateAllDataJson();
    console.log(JSON.stringify(data, null, 2));
  }

  // SHA1ハッシュを計算するヘルパー
  private async calculateSha1(bytes: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-1", bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // NetlifyにJSONをアップロード
  async deployToNetlify(): Promise<void> {
    // デプロイ前に最新のデータを取得
    logger.info("デプロイ前に最新のデータを取得します");
    await this.scrapeAll();

    // 環境変数から設定を取得
    const siteId = Deno.env.get("NETLIFY_SITE_ID");
    const accessToken = Deno.env.get("NETLIFY_ACCESS_TOKEN");

    if (!siteId || !accessToken) {
      logger.error("環境変数 NETLIFY_SITE_ID と NETLIFY_ACCESS_TOKEN を設定してください");
      await logger.flush();
      Deno.exit(1);
    }

    const filesToUpload: { [path: string]: { bytes: Uint8Array, sha1: string } } = {};

    // 1. map.json の準備 (全部入りJSON)
    const allData = await this.generateAllDataJson();
    const jsonString = JSON.stringify(allData, null, 2);
    const jsonBytes = new TextEncoder().encode(jsonString);
    const sha1 = await this.calculateSha1(jsonBytes);
    filesToUpload["/map.json"] = { bytes: jsonBytes, sha1 };

    logger.info("Netlifyへのデプロイを開始します", {
      siteId,
      filesCount: Object.keys(filesToUpload).length,
      files: Object.keys(filesToUpload).map((path) => ({ path, sha1: filesToUpload[path].sha1 })),
    });

    // デプロイ用ペイロードの作成
    const deployFiles: { [path: string]: string } = {};
    for (const [path, info] of Object.entries(filesToUpload)) {
      deployFiles[path] = info.sha1;
    }

    // ステップ1: デプロイを作成してファイルダイジェストを送信
    const deployUrl = `https://api.netlify.com/api/v1/sites/${siteId}/deploys`;
    const deployPayload = {
      files: deployFiles
    };

    logger.info("Netlifyデプロイを作成中...", { deployUrl });
    const deployResponse = await fetch(deployUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(deployPayload)
    });

    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      logger.error(`デプロイの作成に失敗: ${deployResponse.status} ${deployResponse.statusText}`, undefined, {
        status: deployResponse.status,
        statusText: deployResponse.statusText,
        errorText,
      });
      await logger.flush();
      Deno.exit(1);
    }

    const deployData = await deployResponse.json();
    const deployId = deployData.id;
    const required = deployData.required || [];

    logger.info("デプロイを作成しました", { deployId, requiredFilesCount: required.length });

    // ステップ2: 必要なファイルをアップロード
    for (const [path, info] of Object.entries(filesToUpload)) {
      if (required.includes(info.sha1)) {
        logger.info(`ファイルをアップロード中: ${path}`, { path, sha1: info.sha1 });
        const uploadUrl = `https://api.netlify.com/api/v1/deploys/${deployId}/files${path}`;
        
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/octet-stream"
          },
          body: info.bytes as unknown as BodyInit
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          logger.error(`ファイルのアップロードに失敗: ${path} (${uploadResponse.status} ${uploadResponse.statusText})`, undefined, {
            path,
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            errorText,
          });
          await logger.flush();
          Deno.exit(1);
        }

        logger.info(`アップロード完了: ${path}`, { path });
      } else {
        logger.info(`アップロード省略（変更なし）: ${path}`, { path });
      }
    }

    logger.info("Netlifyへのデプロイが完了しました", {
      siteId,
      deployId,
      deployUrl: `https://app.netlify.com/sites/${siteId}/deploys/${deployId}`,
    });
  }
}
