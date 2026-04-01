import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { interpretPrompt, type ParsedIntent } from "@/lib/gemini";
import {
  fetchDiscoverCustom, fetchDiscoverTVCustom,
  searchMulti, searchKeywords,
  fetchMovieRecommendations, fetchTVRecommendations,
  MOVIE_GENRE_MAP, TV_GENRE_MAP,
} from "@/lib/tmdb";

/* ─── Types ─── */

type MediaItem = {
  id: number;
  title: string;
  year: number;
  mediaType: "movie" | "tv";
  overview: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
  source: "recommendation" | "keyword_discover" | "genre_discover";
};

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
  posterPath: string | null;
};

/* ─── Utilities ─── */

function yearFromDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) ? y : 0;
}

function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getStringField(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null || !(key in obj)) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function getNumberField(obj: unknown, key: string): number | null {
  if (typeof obj !== "object" || obj === null || !(key in obj)) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

function decadeToRange(decade: string): [string, string] {
  const match = decade.match(/(\d{4})/);
  if (!match) return ["1970-01-01", `${new Date().getFullYear()}-12-31`];
  const s = parseInt(match[1]);
  return [`${s}-01-01`, `${s + 9}-12-31`];
}

function genreIdsForMediaType(genres: string[], mt: "movie" | "tv"): number[] {
  const map = mt === "movie" ? MOVIE_GENRE_MAP : TV_GENRE_MAP;
  return genres.map((g) => map[g]).filter((id): id is number => typeof id === "number");
}

/* ─── Scoring ─── */

const MOOD_KEYWORDS: Record<string, string[]> = {
  dark: ["dark", "grim", "bleak", "sinister", "haunting"],
  lighthearted: ["fun", "lighthearted", "cheerful", "heartwarming", "charming"],
  intense: ["intense", "gripping", "relentless", "suspense", "edge"],
  cerebral: ["cerebral", "thought-provoking", "complex", "puzzle"],
  emotional: ["emotional", "moving", "touching", "heartfelt"],
  adventurous: ["adventure", "journey", "quest", "explore"],
  relaxing: ["gentle", "peaceful", "calm", "soothing"],
  nostalgic: ["nostalgic", "classic", "retro", "timeless"],
};

function scoreItem(
  item: MediaItem,
  intent: ParsedIntent,
  likeCounts: Map<number, number>,
  passCounts: Map<number, number>,
): number {
  let s = 0;

  // Source bonus: TMDB recommendations are already relevance-vetted
  if (item.source === "recommendation") s += 35;
  else if (item.source === "keyword_discover") s += 15;

  // Baseline quality (modest — don't let rating dominate)
  s += item.vote_average * 1.5;
  s += Math.log10(item.vote_count + 1) * 2;

  // Genre overlap
  const itemGenres = new Set(item.genre_ids);
  const intentIds = genreIdsForMediaType(intent.genres, item.mediaType);
  let genreOverlap = 0;
  for (const gid of intentIds) {
    if (itemGenres.has(gid)) genreOverlap++;
  }
  s += genreOverlap * 20;
  if (intentIds.length > 0 && genreOverlap === 0) s -= 15;

  // Decade match
  if (intent.decades.length > 0 && item.year > 0) {
    for (const decade of intent.decades) {
      const decadeStart = parseInt(decade);
      if (item.year >= decadeStart && item.year <= decadeStart + 9) { s += 10; break; }
    }
  }

  // Quality preference
  if (intent.quality === "underrated") {
    s += Math.max(0, 30 - Math.log10(item.popularity + 1) * 10);
  } else if (intent.quality === "bad") {
    s -= item.vote_average * 2;
    s += Math.log10(item.popularity + 1) * 2;
  } else if (intent.quality === "acclaimed") {
    s += item.vote_average * 3;
  }

  // Theme + keyword matching in overview
  const overview = item.overview.toLowerCase();
  for (const theme of intent.themes) {
    if (overview.includes(theme.toLowerCase())) s += 8;
  }
  for (const kw of intent.keywords) {
    if (overview.includes(kw.toLowerCase())) s += 6;
  }

  // Mood nudges
  if (intent.mood !== "any") {
    const kws = MOOD_KEYWORDS[intent.mood] ?? [];
    for (const kw of kws) {
      if (overview.includes(kw)) { s += 4; break; }
    }
  }

  // User taste
  for (const g of item.genre_ids) {
    s += (likeCounts.get(g) ?? 0) * 2;
    s -= (passCounts.get(g) ?? 0) * 1;
  }

  return s;
}

function generateReason(item: MediaItem, intent: ParsedIntent): string {
  const parts: string[] = [];

  if (item.source === "recommendation" && intent.referenceTitles[0]) {
    parts.push(`Because you like ${intent.referenceTitles[0]}`);
  } else if (intent.quality === "underrated") {
    parts.push("Hidden gem");
  } else if (intent.quality === "bad") {
    parts.push("So-bad-it's-good");
  }

  const decade = item.year > 0 ? `${Math.floor(item.year / 10) * 10}s` : "";
  const primaryGenre = (intent.genres[0] ?? "").replace(/_/g, " ");

  if (parts.length === 0 && decade && primaryGenre) parts.push(`${decade} ${primaryGenre}`);
  else if (parts.length === 0 && primaryGenre) parts.push(primaryGenre);
  else if (parts.length === 0 && decade) parts.push(decade);

  if (item.vote_average >= 6.0) parts.push(`${item.vote_average.toFixed(1)}★`);
  if (intent.mood && intent.mood !== "any" && parts.length < 3) parts.push(`${intent.mood} vibe`);

  return parts.join(" · ") || intent.description || "Curated pick";
}

/* ─── Main handler ─── */

export async function POST(request: Request) {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get("sessionId")?.value;
  if (!sessionId) sessionId = crypto.randomUUID();

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }

  const q = (getStringField(body, "q") ?? "").trim();
  const reroll = getNumberField(body, "reroll") ?? 0;

  const likes = typeof body === "object" && body !== null && "likes" in body &&
    Array.isArray((body as Record<string, unknown>).likes)
    ? ((body as Record<string, unknown>).likes as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const passes = typeof body === "object" && body !== null && "passes" in body &&
    Array.isArray((body as Record<string, unknown>).passes)
    ? ((body as Record<string, unknown>).passes as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const seenIds = new Set([...likes, ...passes]);

  /* ── 1. Parse intent ── */
  const intent = await interpretPrompt(q);
  console.log("[Deck] Intent:", JSON.stringify(intent));

  const wantMovies = intent.mediaType !== "tv";
  const wantTV = intent.mediaType !== "movie";
  const minVotes = intent.quality === "underrated" ? 50 : 100;
  const minAvg = intent.quality === "bad" ? undefined : 5.5;

  /* ── 2. STRATEGY A: Recommendations from reference titles ── */
  const recItems: MediaItem[] = [];
  for (const title of intent.referenceTitles.slice(0, 2)) {
    const searchResults = await searchMulti(title);
    for (const sr of searchResults.slice(0, 1)) {
      if (sr.media_type === "tv" && wantTV) {
        const recs = await fetchTVRecommendations(sr.id);
        recItems.push(...recs.map((m) => ({
          id: m.id, title: m.name, year: yearFromDate(m.first_air_date),
          mediaType: "tv" as const, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
          vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
          popularity: m.popularity ?? 0, poster_path: m.poster_path,
          source: "recommendation" as const,
        })));
      } else if (sr.media_type === "movie" && wantMovies) {
        const recs = await fetchMovieRecommendations(sr.id);
        recItems.push(...recs.map((m) => ({
          id: m.id, title: m.title, year: yearFromDate(m.release_date),
          mediaType: "movie" as const, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
          vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
          popularity: m.popularity ?? 0, poster_path: m.poster_path,
          source: "recommendation" as const,
        })));
      }
    }
  }

  /* ── 3. STRATEGY B: Keyword-based discover ── */
  const keywordIds: number[] = [];
  for (const kw of intent.keywords.slice(0, 5)) {
    const results = await searchKeywords(kw);
    if (results[0]) keywordIds.push(results[0].id);
  }
  const keywordCsv = [...new Set(keywordIds)].join("|"); // OR logic for keywords

  /* ── 4. Build date ranges ── */
  let dateRanges: { gte: string; lte: string }[];
  if (intent.decades.length > 0) {
    dateRanges = intent.decades.slice(0, 3).map((d) => {
      const [gte, lte] = decadeToRange(d);
      return { gte, lte };
    });
  } else {
    const year = new Date().getFullYear();
    dateRanges = [
      { gte: "1970-01-01", lte: "1999-12-31" },
      { gte: "2000-01-01", lte: `${year - 5}-12-31` },
      { gte: `${year - 5}-01-01`, lte: `${year}-12-31` },
    ];
  }

  /* ── 5. Build genre filters (AND logic = comma) ── */
  const movieGenreIds = intent.genres.map((g) => MOVIE_GENRE_MAP[g]).filter(Boolean);
  const movieGenreCsv = movieGenreIds.join(",");
  const tvGenreIds = intent.genres.map((g) => TV_GENRE_MAP[g]).filter((id): id is number => typeof id === "number");
  const tvGenreCsv = [...new Set(tvGenreIds)].join(",");

  /* ── 6. Fetch discover candidates ── */
  const fetches: Promise<MediaItem[]>[] = [];

  for (const range of dateRanges) {
    for (const page of [1, 2]) {
      // Keyword+genre discover (most targeted)
      if (keywordCsv && wantMovies) {
        fetches.push(fetchDiscoverCustom({
          page, sort_by: "vote_average.desc", vote_count_gte: minVotes,
          vote_average_gte: minAvg, with_keywords: keywordCsv,
          primary_release_date_gte: range.gte, primary_release_date_lte: range.lte,
        }).then(items => items.map(m => ({
          id: m.id, title: m.title, year: yearFromDate(m.release_date),
          mediaType: "movie" as const, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
          vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
          popularity: m.popularity ?? 0, poster_path: m.poster_path,
          source: "keyword_discover" as const,
        }))));
      }
      if (keywordCsv && wantTV) {
        fetches.push(fetchDiscoverTVCustom({
          page, sort_by: "vote_average.desc", vote_count_gte: minVotes,
          vote_average_gte: minAvg, with_keywords: keywordCsv,
          first_air_date_gte: range.gte, first_air_date_lte: range.lte,
        }).then(items => items.map(m => ({
          id: m.id, title: m.name, year: yearFromDate(m.first_air_date),
          mediaType: "tv" as const, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
          vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
          popularity: m.popularity ?? 0, poster_path: m.poster_path,
          source: "keyword_discover" as const,
        }))));
      }

      // Genre-only discover (breadth fallback)
      if (wantMovies && movieGenreCsv) {
        fetches.push(fetchDiscoverCustom({
          page, sort_by: "vote_average.desc", vote_count_gte: minVotes,
          vote_average_gte: minAvg, with_genres: movieGenreCsv,
          primary_release_date_gte: range.gte, primary_release_date_lte: range.lte,
        }).then(items => items.map(m => ({
          id: m.id, title: m.title, year: yearFromDate(m.release_date),
          mediaType: "movie" as const, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
          vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
          popularity: m.popularity ?? 0, poster_path: m.poster_path,
          source: "genre_discover" as const,
        }))));
      }
      if (wantTV && tvGenreCsv) {
        fetches.push(fetchDiscoverTVCustom({
          page, sort_by: "vote_average.desc", vote_count_gte: minVotes,
          vote_average_gte: minAvg, with_genres: tvGenreCsv,
          first_air_date_gte: range.gte, first_air_date_lte: range.lte,
        }).then(items => items.map(m => ({
          id: m.id, title: m.name, year: yearFromDate(m.first_air_date),
          mediaType: "tv" as const, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
          vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
          popularity: m.popularity ?? 0, poster_path: m.poster_path,
          source: "genre_discover" as const,
        }))));
      }
    }
  }

  const discoverResults = await Promise.all(fetches);
  const allItems = [...recItems, ...discoverResults.flat()];

  /* ── 7. De-dupe (prefer recommendation source) ── */
  const byKey = new Map<string, MediaItem>();
  for (const item of allItems) {
    const key = `${item.mediaType[0]}${item.id}`;
    const existing = byKey.get(key);
    if (!existing || item.source === "recommendation") {
      byKey.set(key, item);
    }
  }

  /* ── 8. Genre weights from likes/passes ── */
  const likeSet = new Set(likes);
  const passSet = new Set(passes);
  const likeCounts = new Map<number, number>();
  const passCounts = new Map<number, number>();
  for (const item of byKey.values()) {
    const k = `${item.mediaType[0]}${item.id}`;
    if (likeSet.has(k)) for (const g of item.genre_ids) likeCounts.set(g, (likeCounts.get(g) ?? 0) + 1);
    if (passSet.has(k)) for (const g of item.genre_ids) passCounts.set(g, (passCounts.get(g) ?? 0) + 1);
  }

  /* ── 9. Filter ── */
  const maxPopularity = intent.quality === "underrated" ? 60 : Infinity;
  let candidates = Array.from(byKey.values())
    .filter((m) => m.poster_path)
    .filter((m) => m.vote_count >= Math.min(minVotes, 50))
    .filter((m) => m.popularity <= maxPopularity)
    .filter((m) => !seenIds.has(`${m.mediaType[0]}${m.id}`));

  // Hard genre filter (skip for recommendation-sourced items)
  if (intent.genres.length > 0) {
    const genreFiltered = candidates.filter((m) => {
      if (m.source === "recommendation") return true; // trust TMDB recs
      const ids = genreIdsForMediaType(intent.genres, m.mediaType);
      return ids.some((gid) => m.genre_ids.includes(gid));
    });
    if (genreFiltered.length >= 15) candidates = genreFiltered;
  }

  /* ── 10. Score, rank, shuffle ── */
  const seed = hashStringToSeed(`${sessionId}:${new Date().toDateString()}:${reroll}`);
  const rand = mulberry32(seed);

  const ranked = candidates
    .map((m) => ({ m, s: scoreItem(m, intent, likeCounts, passCounts) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);

  const topBucket = ranked.slice(0, 60);
  const midBucket = ranked.slice(60, 220);
  shuffleInPlace(topBucket, rand);
  shuffleInPlace(midBucket, rand);

  let picked = [...topBucket.slice(0, 7), ...midBucket.slice(0, 3)];
  if (picked.length < 10) {
    const seen = new Set(picked.map((m) => `${m.mediaType[0]}${m.id}`));
    for (const m of ranked) {
      if (picked.length >= 10) break;
      const k = `${m.mediaType[0]}${m.id}`;
      if (!seen.has(k)) { picked.push(m); seen.add(k); }
    }
  }
  picked = picked.slice(0, 10);

  /* ── 11. Build cards ── */
  const cards: DeckCard[] = picked.map((m) => ({
    id: `${m.mediaType[0]}${m.id}`,
    title: m.title,
    year: m.year,
    kind: m.mediaType,
    reason: generateReason(m, intent),
    posterPath: m.poster_path,
  }));

  const response = NextResponse.json({ interpretedAs: intent.description, cards });
  if (!cookieStore.get("sessionId")?.value) {
    response.cookies.set("sessionId", sessionId, { httpOnly: true, path: "/" });
  }
  return response;
}
