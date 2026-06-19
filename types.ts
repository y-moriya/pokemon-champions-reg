// ポケモンチャンピオンズ ランクバトルお知らせ収集 - 型定義

export interface NewsListItem {
  id: string;
  reg: number | string;
  title: string;
  infoTab?: number;
  infoKind?: number;
  kind?: string;
  kindTxt: string;
  banner: string;
  isImportant: number | string;
  stAt: number | string;
  newAt?: number | string;
  link: string;
}

export interface NewsListData {
  hash: string;
  data: NewsListItem[];
}

export interface RankBattleNews {
  url: string;
  title: string;
  season: string;
  regulation: string;
  pokemonLink?: string;
  startAt?: string;
  endAt?: string;
  fetchedAt: string;
}

export interface PokemonInfo {
  id: string;
  name: string;
}

