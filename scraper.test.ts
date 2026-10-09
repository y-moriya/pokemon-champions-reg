import { describe, it, expect, vi } from "vitest";
import { PokemonChampionsScraper } from "./scraper.ts";
import type { NewsListItem, RankBattleNews } from "./types.ts";

// モック KVNamespace 実装
function createMockKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      return store.get(key) ?? null;
    }),
    put: vi.fn().mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn().mockImplementation(async (options?: { prefix?: string }) => {
      const prefix = options?.prefix ?? "";
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    }),
  } as unknown as KVNamespace;
}

describe("PokemonChampionsScraper", () => {
  it("filterRankBattleNews - ランクバトルの告知のみを正しくフィルタリングできる", () => {
    const mockKV = createMockKV();
    const scraper = new PokemonChampionsScraper(mockKV);

    const items: NewsListItem[] = [
      {
        id: "1",
        reg: 1,
        title: "「ランクバトル シーズンM-1」開催中！",
        kindTxt: "ランクバトル",
        infoKind: 11,
        banner: "",
        isImportant: 0,
        stAt: 1,
        link: "news/1",
      },
      {
        id: "2",
        reg: 1,
        title: "「ランクバトル シーズン1」開催中！",
        kindTxt: "ランクバトル",
        kind: "11",
        banner: "",
        isImportant: 0,
        stAt: 2,
        link: "news/2",
      },
      {
        id: "3",
        reg: 1,
        title: "メンテナンスのお知らせ",
        kindTxt: "お知らせ",
        infoKind: 1,
        banner: "",
        isImportant: 0,
        stAt: 3,
        link: "news/3",
      },
    ];

    const filtered = scraper.filterRankBattleNews(items);
    expect(filtered.length).toBe(2);
    expect(filtered[0].title).toBe("「ランクバトル シーズンM-1」開催中！");
    expect(filtered[1].title).toBe("「ランクバトル シーズン1」開催中！");
  });

  it("saveNews & isAlreadyFetched - ニュースの保存と存在チェックが動作する", async () => {
    const mockKV = createMockKV();
    const scraper = new PokemonChampionsScraper(mockKV);

    const news: RankBattleNews = {
      url: "https://example.com/news/1",
      title: "「ランクバトル シーズンM-1」開催中！",
      season: "M-1",
      regulation: "M-A",
      fetchedAt: new Date().toISOString(),
    };

    expect(await scraper.isAlreadyFetched(news.url)).toBe(false);
    await scraper.saveNews(news);
    expect(await scraper.isAlreadyFetched(news.url)).toBe(true);
  });

  it("extractPageContent - HTMLからシーズン、レギュレーション、日付、リンクを抽出できる", async () => {
    const mockKV = createMockKV();
    const scraper = new PokemonChampionsScraper(mockKV);

    const mockHtml = `
      <html>
        <body>
          <div class="article-body">
            <p>ランクバトル シーズンM-1 が開催されます！</p>
            <p>使用可能なルールは レギュレーションM-A です。</p>
            <p>開催期間: 2026年4月8日（水）～5月13日（水）10:59</p>
            <a href="https://example.com/pokemon-list">参加できるポケモン</a>
          </div>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(mockHtml, { status: 200 }));

    const result = await scraper.extractPageContent({
      id: "1",
      reg: 1,
      title: "「ランクバトル シーズンM-1」開催中！",
      kindTxt: "ランクバトル",
      banner: "",
      isImportant: 0,
      stAt: 1,
      link: "news/1",
    });

    expect(result).not.toBeNull();
    expect(result?.season).toBe("M-1");
    expect(result?.regulation).toBe("M-A");
    expect(result?.startAt).toBe("2026-04-08");
    expect(result?.endAt).toBe("2026-05-13T10:59:00");
    expect(result?.pokemonLink).toBe("https://example.com/pokemon-list");
  });

  it("fetchPokemonList - ポケモンリストHTMLから配列を抽出できる", async () => {
    const mockKV = createMockKV();
    const scraper = new PokemonChampionsScraper(mockKV);

    const mockHtml = `
      <script>
        const pokemons = [
          ["0003-000", "フシギバナ", "フシギバナ"],
          ["0006-000", "リザードン", "リザードン"]
        ];
      </script>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(mockHtml, { status: 200 }));

    const list = await scraper.fetchPokemonList("https://example.com/pokemon-list");
    expect(list.length).toBe(2);
    expect(list[0]).toEqual({ id: "0003-000", name: "フシギバナ" });
    expect(list[1]).toEqual({ id: "0006-000", name: "リザードン" });
  });

  it("generateAllDataJson - 全データJSONを構築してKVキャッシュに保存できる", async () => {
    const mockKV = createMockKV();
    const scraper = new PokemonChampionsScraper(mockKV);

    const news: RankBattleNews = {
      url: "https://example.com/news/1",
      title: "「ランクバトル シーズンM-1」開催中！",
      season: "M-1",
      regulation: "M-A",
      pokemonLink: "https://example.com/pokemon-list",
      startAt: "2026-04-08",
      endAt: "2026-05-13T10:59:00",
      fetchedAt: new Date().toISOString(),
    };
    await scraper.saveNews(news);

    await mockKV.put(
      "regulation_pokemon:M-A",
      JSON.stringify([{ id: "0003-000", name: "フシギバナ" }])
    );

    const allData = await scraper.generateAllDataJson();
    expect(allData.seasons.length).toBe(1);
    expect(allData.seasons[0].season).toBe("M-1");
    expect(allData.seasons[0].regulation).toBe("M-A");
    expect(allData.regulations["M-A"]).toBeDefined();
    expect(allData.regulations["M-A"].pokemons.length).toBe(1);
    expect(allData.regulations["M-A"].pokemons[0].name).toBe("フシギバナ");
  });
});
