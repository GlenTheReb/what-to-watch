import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { interpretPrompt, generateWhyReasons, type ParsedIntent } from "@/lib/gemini";
import {
  fetchDiscoverCustom, fetchDiscoverTVCustom,
  searchMulti, searchKeywords,
  fetchMovieRecommendations, fetchTVRecommendations,
  fetchTrending, fetchPopular, fetchTopRated, fetchUpcomingMovies,
  searchPerson, fetchPersonMovieCredits, fetchPersonTVCredits,
  fetchMovieCredits, fetchTVCredits, fetchKeywordTags,
  getGenreIds, getGenreNames, fetchMovieSimilar, fetchTVSimilar
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
  source: "recommendation" | "keyword_discover" | "genre_discover" | "trending" | "popular" | "top_rated" | "upcoming" | "person_credits" | "targeted_discover" | "similar";
  original_language: string;
};

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
  voteAverage: number;
  posterPath: string | null;
  genres: string[];
  director: string | null;
  cast: string[];
  parentalRating: string | null;
  watchProviders?: { provider_name: string; logo_path: string }[];
  watchLink?: string;
  language?: string;
  trailerUrl?: string | null;
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
  keywordTags: string[],
  intentMovieGenreIds: number[],
  intentTVGenreIds: number[]
): { score: number; breakdown: Record<string, number | string> } {
  let s = 0;
  const breakdown: Record<string, number | string> = {};

  // Theme + keyword matching — PRIMARY relevance signal
  // Split multi-word terms into individual words and match against overview + title.
  const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "of", "in", "to", "for", "is", "it", "on", "by", "with", "as", "at", "from", "that", "this", "but", "not", "are", "was", "were", "has", "had", "its"]);
  const overview = item.overview.toLowerCase();
  const titleLower = item.title.toLowerCase();
  const searchText = `${titleLower} ${overview}`;

  // Build a deduplicated set of meaningful words from all themes + keywords
  const allTermWords = new Set<string>();
  for (const term of [...intent.themes, ...intent.keywords]) {
    for (const word of term.toLowerCase().split(/\s+/)) {
      if (word.length > 3 && !STOP_WORDS.has(word)) allTermWords.add(word);
    }
  }

  let wordHits = 0;
  const matchedWords: string[] = [];
  const missedWords: string[] = [];
  for (const word of allTermWords) {
    if (searchText.includes(word)) { wordHits++; matchedWords.push(word); }
    else missedWords.push(word);
  }

  // Overview text is a SECONDARY signal — unreliable, short marketing blurbs
  let wordScore = 0;
  const hitValues = [10, 8, 5, 3, 3, 3, 3, 3];
  for (let i = 0; i < wordHits; i++) {
    wordScore += hitValues[Math.min(i, hitValues.length - 1)];
  }
  s += wordScore;
  breakdown.wordHits = wordHits;
  breakdown.wordScore = wordScore;
  breakdown.matched = matchedWords.join(",") || "none";
  breakdown.missed = missedWords.join(",") || "none";

  // TMDB keyword tag matching — structured metadata signal
  // Match intent phrases against the show's actual TMDB keyword tags
  let tagHits = 0;
  const matchedTags: string[] = [];
  const fullTerms = [...new Set([...intent.themes, ...intent.keywords].map(t => t.toLowerCase().trim()))].filter(t => t.length > 3);
  if (keywordTags.length > 0) {
    for (const term of fullTerms) {
      // Check if any TMDB tag contains this full phrase
      if (keywordTags.some(tag => tag.includes(term))) {
        tagHits++;
        matchedTags.push(term);
      }
    }
  }
  // TMDB tags are the PRIMARY signal — structured, reliable metadata
  // Diminishing returns: 1st +18, 2nd +15, 3rd +12, 4th+ +8. No cap.
  const tagHitValues = [18, 15, 12, 8, 8, 8];
  let tagScore = 0;
  for (let i = 0; i < tagHits; i++) {
    tagScore += tagHitValues[Math.min(i, tagHitValues.length - 1)];
  }
  s += tagScore;
  breakdown.tagHits = tagHits;
  breakdown.tagScore = tagScore;
  if (matchedTags.length > 0) breakdown.matchedTags = matchedTags.join(",");

  // Completeness bonus: reward shows matching 75%+ of all unique term words
  let completenessBonus = 0;
  if (allTermWords.size > 0 && wordHits >= Math.ceil(allTermWords.size * 0.75)) {
    completenessBonus = 20;
  }
  s += completenessBonus;
  breakdown.completeness = completenessBonus;

  // Source bonus — only for high-signal sources, NOT discover pipelines
  let sourceBonus = 0;
  if (item.source === "recommendation") {
    sourceBonus = wordHits >= 2 ? 120 : 35;
  }
  else if (item.source === "person_credits") sourceBonus = 40;
  else if (item.source === "trending" || item.source === "upcoming") sourceBonus = 10;
  s += sourceBonus;
  breakdown.source = sourceBonus;

  // Baseline quality
  const qualityBase = item.vote_average * 1.5 + Math.log10(item.vote_count + 1) * 2;
  s += qualityBase;
  breakdown.quality = Math.round(qualityBase * 10) / 10;

  // Genre overlap
  const itemGenres = new Set(item.genre_ids);
  const intentIds = new Set(item.mediaType === "movie" ? intentMovieGenreIds : intentTVGenreIds);
  let genreOverlap = 0;
  for (const gid of intentIds) {
    if (itemGenres.has(gid)) genreOverlap++;
  }
  let genreScore = genreOverlap * 8;
  if (intentIds.size > 0 && genreOverlap === 0) genreScore = -10;
  s += genreScore;
  breakdown.genre = `${genreOverlap}/${intentIds.size}=${genreScore}`;

  // Decade match
  let decadeScore = 0;
  if (intent.decades.length > 0 && item.year > 0) {
    for (const decade of intent.decades) {
      const decadeStart = parseInt(decade);
      if (item.year >= decadeStart && item.year <= decadeStart + 9) { decadeScore = 10; break; }
    }
  }
  s += decadeScore;
  if (decadeScore) breakdown.decade = decadeScore;

  // Quality preference
  let qualPref = 0;
  if (intent.quality === "underrated") {
    qualPref = Math.max(0, 30 - Math.log10(item.popularity + 1) * 10);
  } else if (intent.quality === "bad") {
    qualPref = -(item.vote_average * 2) + Math.log10(item.popularity + 1) * 2;
  } else if (intent.quality === "acclaimed") {
    qualPref = item.vote_average * 3;
  }
  s += qualPref;
  if (qualPref) breakdown.qualPref = Math.round(qualPref * 10) / 10;

  // Mood nudges
  let moodScore = 0;
  if (intent.mood !== "any") {
    const kws = MOOD_KEYWORDS[intent.mood] ?? [];
    for (const kw of kws) {
      if (overview.includes(kw)) { moodScore = 4; break; }
    }
  }
  s += moodScore;
  if (moodScore) breakdown.mood = moodScore;

  // User taste
  let tasteScore = 0;
  for (const g of item.genre_ids) {
    tasteScore += (likeCounts.get(g) ?? 0) * 2;
    tasteScore -= (passCounts.get(g) ?? 0) * 1;
  }
  s += tasteScore;
  if (tasteScore) breakdown.taste = tasteScore;

  return { score: s, breakdown };
}

function generateReason(item: MediaItem, intent: ParsedIntent): string {
  const parts: string[] = [];

  if (item.source === "recommendation" && intent.referenceTitles[0]) {
    parts.push(`Because you like ${intent.referenceTitles[0]}`);
  } else if (item.source === "person_credits" && intent.people[0]) {
    parts.push(`Starring ${intent.people[0]}`);
  } else if (item.source === "trending") {
    parts.push("Trending now");
  } else if (item.source === "upcoming") {
    parts.push("Coming soon");
  } else if (item.source === "popular") {
    parts.push("Popular");
  } else if (item.source === "top_rated") {
    parts.push("Highly rated");
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
  const countryCode = getStringField(body, "countryCode") ?? "US";

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

  // When using recommendations, also run discover to supplement the pool
  // - For specific mediaType: find content of the correct type across the movie/TV boundary
  // - For "any": broaden the pool with keyword/genre discover alongside TMDB recs
  if (intent.strategies.includes("recommendations")
    && !intent.strategies.includes("discover") && intent.keywords.length > 0) {
    console.log("[Deck] Adding discover supplement for cross-media recommendations");
    intent.strategies.push("discover");
  }

  const intentMovieGenreIds = await getGenreIds(intent.genres, "movie");
  const intentTVGenreIds = await getGenreIds(intent.genres, "tv");

  /* ── 2. Execute Routing Strategies ── */
  const fetches: Promise<MediaItem[]>[] = [];
  let keywordCsv = "";

  const mapMedia = (m: any, mt: "movie" | "tv", source: MediaItem["source"]): MediaItem => ({
    id: m.id, title: m.title || m.name, year: yearFromDate(m.release_date || m.first_air_date),
    mediaType: mt, overview: m.overview ?? "", genre_ids: m.genre_ids ?? [],
    vote_average: m.vote_average ?? 0, vote_count: m.vote_count ?? 0,
    popularity: m.popularity ?? 0, poster_path: m.poster_path, source,
    original_language: m.original_language ?? "en",
  });

  const byKey = new Map<string, MediaItem>();
  const refIds = new Set<string>();

  for (const strategy of intent.strategies) {
    if (strategy === "trending") {
      const mt = intent.mediaType === "any" ? "all" : intent.mediaType;
      fetches.push(fetchTrending(mt as any).then(items =>
        items.map(m => mapMedia(m, "title" in m ? "movie" : "tv", "trending"))
      ));
    }

    if (strategy === "popular") {
      if (wantMovies) fetches.push(fetchPopular("movie").then(items => items.map(m => mapMedia(m, "movie", "popular"))));
      if (wantTV) fetches.push(fetchPopular("tv").then(items => items.map(m => mapMedia(m, "tv", "popular"))));
    }

    if (strategy === "top_rated") {
      if (wantMovies) fetches.push(fetchTopRated("movie").then(items => items.map(m => mapMedia(m, "movie", "top_rated"))));
      if (wantTV) fetches.push(fetchTopRated("tv").then(items => items.map(m => mapMedia(m, "tv", "top_rated"))));
    }

    if (strategy === "upcoming" && wantMovies) {
      fetches.push(fetchUpcomingMovies().then(items => items.map(m => mapMedia(m, "movie", "upcoming"))));
    }

    if (strategy === "person_credits" && intent.people.length > 0) {
      for (const person of intent.people.slice(0, 2)) {
        fetches.push(searchPerson(person).then(async (results) => {
          if (!results[0]) return [];
          const pid = results[0].id;
          const pItems: MediaItem[] = [];
          if (wantMovies) {
            const credits = await fetchPersonMovieCredits(pid);
            if (credits) pItems.push(...credits.cast.map(m => mapMedia(m, "movie", "person_credits")));
          }
          if (wantTV) {
            const credits = await fetchPersonTVCredits(pid);
            if (credits) pItems.push(...credits.cast.map(m => mapMedia(m, "tv", "person_credits")));
          }
          return pItems;
        }));
      }
    }

    if (strategy === "recommendations" && intent.referenceTitles.length > 0) {
      for (const title of intent.referenceTitles.slice(0, 2)) {
        fetches.push(searchMulti(title).then(async (results) => {
          const rItems: MediaItem[] = [];
          for (const sr of results.slice(0, 1)) {
            refIds.add(`${sr.media_type === "tv" ? "t" : "m"}${sr.id}`);
            // Always fetch recs and similar from the reference title's native type
            if (sr.media_type === "tv") {
              const [recs, similar, tags] = await Promise.all([
                fetchTVRecommendations(sr.id),
                fetchTVSimilar(sr.id),
                fetchKeywordTags(sr.id, "tv")
              ]);
              intent.keywords.push(...tags.slice(0, 5));
              rItems.push(...recs.map(m => mapMedia(m, "tv", "recommendation")));
              rItems.push(...similar.map(m => mapMedia(m, "tv", "similar")));
            } else if (sr.media_type === "movie") {
              const [recs, similar, tags] = await Promise.all([
                fetchMovieRecommendations(sr.id),
                fetchMovieSimilar(sr.id),
                fetchKeywordTags(sr.id, "movie")
              ]);
              intent.keywords.push(...tags.slice(0, 5));
              rItems.push(...recs.map(m => mapMedia(m, "movie", "recommendation")));
              rItems.push(...similar.map(m => mapMedia(m, "movie", "similar")));
            }
          }

          // Cross-media: also search for the title as the OTHER type
          if (intent.mediaType === "any") {
            const crossResults = results.filter(r => r.media_type !== results[0]?.media_type).slice(0, 1);
            for (const sr of crossResults) {
              if (sr.media_type === "tv") {
                const [recs, similar] = await Promise.all([
                  fetchTVRecommendations(sr.id),
                  fetchTVSimilar(sr.id)
                ]);
                rItems.push(...recs.map(m => mapMedia(m, "tv", "recommendation")));
                rItems.push(...similar.map(m => mapMedia(m, "tv", "similar")));
              } else if (sr.media_type === "movie") {
                const [recs, similar] = await Promise.all([
                  fetchMovieRecommendations(sr.id),
                  fetchMovieSimilar(sr.id)
                ]);
                rItems.push(...recs.map(m => mapMedia(m, "movie", "recommendation")));
                rItems.push(...similar.map(m => mapMedia(m, "movie", "similar")));
              }
            }
          }

          return rItems;
        }));
      }
    }

    if (strategy === "discover") {
      // Search ALL keywords + themes as TMDB keyword IDs for maximum coverage
      const allSearchTerms = [...new Set([...intent.keywords, ...intent.themes])];
      const keywordIds: number[] = [];
      // Only take top 3 to avoid diluting TMDB results with generic keywords
      for (const kw of allSearchTerms.slice(0, 3)) {
        try {
          const results = await searchKeywords(kw);
          if (results[0]) keywordIds.push(results[0].id);
        } catch (e) {
          console.error(`[Deck] searchKeywords failed for ${kw}`, e);
        }
      }
      keywordCsv = [...new Set(keywordIds)].join("|");

      let dateRanges: { gte: string; lte: string }[];
      if (intent.yearGte || intent.yearLte) {
        const gte = intent.yearGte ? `${intent.yearGte}-01-01` : "1970-01-01";
        const lte = intent.yearLte ? `${intent.yearLte}-12-31` : `${new Date().getFullYear() + 5}-12-31`;
        dateRanges = [{ gte, lte }];
      } else if (intent.decades.length > 0) {
        dateRanges = intent.decades.slice(0, 2).map((d) => {
          const [gte, lte] = decadeToRange(d);
          return { gte, lte };
        });
      } else {
        const year = new Date().getFullYear();
        dateRanges = [{ gte: "1970-01-01", lte: `${year}-12-31` }];
      }

      const movieGenreCsv = intentMovieGenreIds.join(",");
      const tvGenreCsv = intentTVGenreIds.join(",");

      for (const range of dateRanges) {
        // Most targeted: keywords + genres combined
        if (keywordCsv && movieGenreCsv && wantMovies) {
          fetches.push(fetchDiscoverCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: Math.min(minVotes, 50), vote_average_gte: minAvg, with_keywords: keywordCsv, with_genres: movieGenreCsv, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "targeted_discover"))));
        }
        if (keywordCsv && tvGenreCsv && wantTV) {
          fetches.push(fetchDiscoverTVCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: Math.min(minVotes, 50), vote_average_gte: minAvg, with_keywords: keywordCsv, with_genres: tvGenreCsv, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "targeted_discover"))));
        }
        // Keywords only (catches things outside the exact genre match)
        if (keywordCsv && wantMovies) fetches.push(fetchDiscoverCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_keywords: keywordCsv, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "keyword_discover"))));
        if (keywordCsv && wantTV) fetches.push(fetchDiscoverTVCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_keywords: keywordCsv, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "keyword_discover"))));
        
        // Genre-only or purely date-based fallback
        if (!keywordCsv) {
          if (wantMovies && movieGenreCsv) fetches.push(fetchDiscoverCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_genres: movieGenreCsv, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "genre_discover"))));
          else if (wantMovies) fetches.push(fetchDiscoverCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "genre_discover"))));
          
          if (wantTV && tvGenreCsv) fetches.push(fetchDiscoverTVCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_genres: tvGenreCsv, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "genre_discover"))));
          else if (wantTV) fetches.push(fetchDiscoverTVCustom({ page: 1, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "genre_discover"))));
        }
      }
    }
  }

  const fetchSettled = await Promise.allSettled(fetches);
  let candidates = fetchSettled
    .filter((r): r is PromiseFulfilledResult<MediaItem[]> => r.status === "fulfilled")
    .map(r => r.value)
    .flat();
  
  // Filter out the reference titles themselves and franchise entries
  // e.g. don't recommend "One Piece: The Movie" for "something like One Piece"
  const refTitleLower = intent.referenceTitles.map(t => t.toLowerCase().trim()).filter(t => t.length > 0);
  candidates = candidates.filter(m => {
    if (refIds.has(`${m.mediaType[0]}${m.id}`)) return false;
    if (refTitleLower.length > 0) {
      const titleLower = m.title.toLowerCase();
      for (const ref of refTitleLower) {
        if (titleLower.includes(ref) || ref.includes(titleLower)) return false;
      }
    }
    return true;
  });



  /* ── 7. De-dupe (prefer recommendation source) ── */
  for (const item of candidates) {
    const key = `${item.mediaType[0]}${item.id}`;
    const existing = byKey.get(key);
    if (!existing || item.source === "recommendation" || item.source === "similar") {
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
  candidates = Array.from(byKey.values())
    .filter((m) => m.poster_path)
    .filter((m) => m.vote_count >= Math.min(minVotes, 50))
    .filter((m) => m.popularity <= maxPopularity)
    .filter((m) => !seenIds.has(`${m.mediaType[0]}${m.id}`))
    .filter((m) => {
      if (m.year > 0) {
        if (intent.yearGte && m.year < intent.yearGte) return false;
        if (intent.yearLte && m.year > intent.yearLte) return false;
      }
      return true;
    });

  // Anime strict filter
  if (intent.keywords.includes("anime") || intent.description.toLowerCase().includes("anime")) {
    const animeFiltered = candidates.filter((m) => m.original_language === "ja" && m.genre_ids.includes(16));
    if (animeFiltered.length > 0) candidates = animeFiltered;
  }

  // Media type filter: if user asked for "movie" or "tv", filter out the other type
  if (intent.mediaType !== "any") {
    const mtFiltered = candidates.filter((m) => m.mediaType === intent.mediaType);
    // Only apply if we still have enough results after filtering
    if (mtFiltered.length >= 10) {
      candidates = mtFiltered;
    }
  }

  // Hard genre filter
  if (intent.genres.length > 0) {
    const genreFiltered = candidates.filter((m) => {
      const ids = m.mediaType === "movie" ? intentMovieGenreIds : intentTVGenreIds;

      // If the intent strictly requires animation (16) or documentary (99), 
      // the candidate MUST have it, even if it matches other requested genres like Action.
      if (ids.includes(16) && !m.genre_ids.includes(16)) return false;
      if (ids.includes(99) && !m.genre_ids.includes(99)) return false;
      
      // Conversely, if the intent DOES NOT ask for animation, filter out animation to preserve live-action queries.
      if (!ids.includes(16) && m.genre_ids.includes(16)) return false;

      // Apply genreMode matching
      if (intent.genreMode === "strict") {
         return ids.every((gid) => m.genre_ids.includes(gid));
      }
      return ids.some((gid) => m.genre_ids.includes(gid));
    });

    // If we found ANY items matching the requested genres, strictly use them.
    // Quality over quantity: a deck of 4 perfect cards is better than 10 wrong ones.
    if (genreFiltered.length > 0) {
      candidates = genreFiltered;
    }
  }

  /* ── 9b. Pool refill — fetch more pages if pool is too thin ── */
  if (candidates.length < 30 && intent.strategies.includes("discover")) {
    console.log(`[Deck] Pool thin (${candidates.length} candidates), fetching additional discover pages...`);
    const existingKeys = new Set(candidates.map(m => `${m.mediaType[0]}${m.id}`));
    const movieGenreCsv = intentMovieGenreIds.join(",");
    const tvGenreCsv = intentTVGenreIds.join(",");

    const year = new Date().getFullYear();
    const dateRanges = (intent.yearGte || intent.yearLte)
      ? [{ gte: intent.yearGte ? `${intent.yearGte}-01-01` : "1970-01-01", lte: intent.yearLte ? `${intent.yearLte}-12-31` : `${year + 5}-12-31` }]
      : intent.decades.length > 0
      ? intent.decades.slice(0, 2).map(d => { const [gte, lte] = decadeToRange(d); return { gte, lte }; })
      : [{ gte: "1970-01-01", lte: `${year}-12-31` }];

    for (const page of [2, 3, 4, 5]) {
      if (candidates.length >= 30) break;
      const refills: Promise<MediaItem[]>[] = [];
      for (const range of dateRanges) {
        if (keywordCsv && movieGenreCsv && wantMovies) {
          refills.push(fetchDiscoverCustom({ page, sort_by: "vote_count.desc", vote_count_gte: Math.min(minVotes, 50), vote_average_gte: minAvg, with_keywords: keywordCsv, with_genres: movieGenreCsv, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "targeted_discover"))));
        }
        if (keywordCsv && tvGenreCsv && wantTV) {
          refills.push(fetchDiscoverTVCustom({ page, sort_by: "vote_count.desc", vote_count_gte: Math.min(minVotes, 50), vote_average_gte: minAvg, with_keywords: keywordCsv, with_genres: tvGenreCsv, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "targeted_discover"))));
        }
        if (keywordCsv && wantMovies) refills.push(fetchDiscoverCustom({ page, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_keywords: keywordCsv, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "keyword_discover"))));
        if (keywordCsv && wantTV) refills.push(fetchDiscoverTVCustom({ page, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_keywords: keywordCsv, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "keyword_discover"))));
        
        if (!keywordCsv) {
          if (wantMovies && movieGenreCsv) refills.push(fetchDiscoverCustom({ page, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_genres: movieGenreCsv, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "genre_discover"))));
          else if (wantMovies) refills.push(fetchDiscoverCustom({ page, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, primary_release_date_gte: range.gte, primary_release_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "movie", "genre_discover"))));
          
          if (wantTV && tvGenreCsv) refills.push(fetchDiscoverTVCustom({ page, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, with_genres: tvGenreCsv, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "genre_discover"))));
          else if (wantTV) refills.push(fetchDiscoverTVCustom({ page, sort_by: "vote_count.desc", vote_count_gte: minVotes, vote_average_gte: minAvg, first_air_date_gte: range.gte, first_air_date_lte: range.lte }).then(items => items.map(m => mapMedia(m, "tv", "genre_discover"))));
        }
      }
      const refillSettled = await Promise.allSettled(refills);
      const refillResults = refillSettled
        .filter((r): r is PromiseFulfilledResult<MediaItem[]> => r.status === "fulfilled")
        .map(r => r.value)
        .flat();
      let added = 0;
      for (const item of refillResults) {
        const k = `${item.mediaType[0]}${item.id}`;
        if (existingKeys.has(k) || seenIds.has(k) || !item.poster_path) continue;
        if (item.vote_count < Math.min(minVotes, 50)) continue;
        if (intent.mediaType !== "any" && item.mediaType !== intent.mediaType) continue;
        // Genre filter
        if (intent.genres.length > 0) {
          const ids = item.mediaType === "movie" ? intentMovieGenreIds : intentTVGenreIds;
          if (!ids.includes(16) && item.genre_ids.includes(16)) continue;
          if (!ids.some(gid => item.genre_ids.includes(gid))) continue;
        }
        existingKeys.add(k);
        candidates.push(item);
        added++;
      }
      console.log(`[Deck] Refill page ${page}: +${added} candidates (total: ${candidates.length})`);
    }
  }

  /* ── 10. Fetch TMDB keyword tags for top candidates ── */
  // Pre-sort by a quick score (genre overlap + quality) to pick top 25 for tag fetching
  const quickScored = candidates
    .map((m) => {
      const intentIds = new Set(m.mediaType === "movie" ? intentMovieGenreIds : intentTVGenreIds);
      let qs = 0;
      for (const gid of intentIds) { if (m.genre_ids.includes(gid)) qs += 8; }
      qs += m.vote_average * 1.5;
      return { m, qs };
    })
    .sort((a, b) => b.qs - a.qs);

  const top25 = quickScored.slice(0, 25).map(x => x.m);
  const tagMap = new Map<string, string[]>(); // key: "movie:123" or "tv:456"

  console.log(`[Deck] Fetching keyword tags for top ${top25.length} candidates...`);
  const tagResults = await Promise.allSettled(
    top25.map(async (m) => {
      const mt = m.mediaType === "movie" ? "movie" as const : "tv" as const;
      const tags = await fetchKeywordTags(m.id, mt);
      return { key: `${mt}:${m.id}`, tags };
    })
  );
  for (const result of tagResults) {
    if (result.status === "fulfilled") tagMap.set(result.value.key, result.value.tags);
  }
  console.log(`[Deck] Keyword tags fetched.`);

  /* ── 11. Score, rank, shuffle ── */
  const seed = hashStringToSeed(`${sessionId}:${new Date().toDateString()}:${reroll}`);
  const rand = mulberry32(seed);

  const scored = candidates
    .map((m) => {
      const mt = m.mediaType === "movie" ? "movie" : "tv";
      const tags = tagMap.get(`${mt}:${m.id}`) ?? [];
      const { score, breakdown } = scoreItem(m, intent, likeCounts, passCounts, tags, intentMovieGenreIds, intentTVGenreIds);
      return { m, s: score, breakdown };
    })
    .sort((a, b) => b.s - a.s);

  // Debug: show top 10 candidates with full score breakdowns
  console.log(`[Deck] Top 10 scored candidates (detailed):`);
  for (const { m, s, breakdown } of scored.slice(0, 10)) {
    console.log(`  ${s.toFixed(1).padStart(6)} | ${m.source.padEnd(20)} | ${m.title} (${m.year})`);
    console.log(`         ${JSON.stringify(breakdown)}`);
  }

  const ranked = scored.map((x) => x.m);

  // Pin the top 5 highest-scoring items — they always appear.
  const pinned = ranked.slice(0, 5);

  // Create a variety pool, but cut it off if scores drop off a cliff.
  // This prevents irrelevant generic fallbacks from sneaking into highly specific queries.
  const lastPinnedScore = pinned.length > 0 ? scored[pinned.length - 1].s : 0;
  const minVarietyScore = lastPinnedScore * 0.8; 
  
  let varietyPool = scored
    .slice(5, 15)
    .filter((x) => x.s >= minVarietyScore)
    .map((x) => x.m);

  // If variety pool is small, that's fine — quality over quantity.
  // Don't backfill with unfiltered junk.

  shuffleInPlace(varietyPool, rand);

  let picked = [...pinned, ...varietyPool.slice(0, 5)];
  if (picked.length < 10) {
    const seen = new Set(picked.map((m) => `${m.mediaType[0]}${m.id}`));
    for (const { m, s: itemScore } of scored) {
      if (picked.length >= 10) break;
      if (itemScore < minVarietyScore) continue; // Only pad with quality items
      const k = `${m.mediaType[0]}${m.id}`;
      if (!seen.has(k)) { picked.push(m); seen.add(k); }
    }
  }
  picked = picked.slice(0, 10);

  /* ── 11. Fetch credits for final picks & generate "Why X?" reasons via Gemini ── */
  const creditsResults = await Promise.all(
    picked.map((m) =>
      m.mediaType === "movie"
        ? fetchMovieCredits(m.id).catch(() => ({ cast: [] } as any))
        : fetchTVCredits(m.id).catch(() => ({ cast: [] } as any)),
    ),
  );

  const aiReasons = await generateWhyReasons(
    q,
    intent,
    picked.map((m, i) => ({
      title: m.title,
      year: m.year,
      overview: m.overview,
      mediaType: m.mediaType,
      source: m.source,
      cast: creditsResults[i].cast,
      director: creditsResults[i].director,
    })),
  );

  /* ── 12. Build cards ── */

  const cards: DeckCard[] = await Promise.all(picked.map(async (m, i) => {
    const genres = await getGenreNames(m.genre_ids, m.mediaType);
    
    const allProviders = creditsResults[i].watchProviders ?? {};
    const localProviders = allProviders[countryCode] ?? allProviders["US"] ?? {};
    const streaming = localProviders.flatrate ?? [];
    const watchLink = localProviders.link ?? null;

    return {
      id: `${m.mediaType[0]}${m.id}`,
      title: m.title,
      year: m.year,
      kind: m.mediaType,
      reason: aiReasons[i] || generateReason(m, intent),
      voteAverage: m.vote_average,
      posterPath: m.poster_path,
      genres,
      director: creditsResults[i].director,
      cast: creditsResults[i].cast,
      parentalRating: creditsResults[i].parentalRating,
      watchProviders: streaming,
      watchLink,
      language: m.original_language ? m.original_language.toUpperCase() : "EN",
      trailerUrl: creditsResults[i].trailerUrl ?? null,
    };
  }));

  console.log(`[Deck] Generated Cards for "${q}":\n`, cards.map((c, i) => `  ${i + 1}. ${c.title} (${c.year})`).join("\n"));

  const response = NextResponse.json({ interpretedAs: intent.description, cards });
  if (!cookieStore.get("sessionId")?.value) {
    response.cookies.set("sessionId", sessionId, { httpOnly: true, path: "/" });
  }
  return response;
}
