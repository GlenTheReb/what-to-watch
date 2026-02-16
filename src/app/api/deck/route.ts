import { NextResponse } from "next/server";
import { fetchDiscoverCustom } from "@/lib/tmdb";

import { cookies } from "next/headers";

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
  posterPath: string | null;
};

function yearFromDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) ? y : 0;
}

function hashStringToSeed(str: string): number {
  // simple deterministic hash → 32-bit seed
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

const GENRE = {
  animation: 16,
  comedy: 35,
  horror: 27,
  mystery: 9648,
} as const;

type Signature = {
  anime: boolean;
  comedy: boolean;
  horror: boolean;
  mystery: boolean;
  trippy: boolean;
  underrated: boolean;
  badMovie: boolean;
};

function getStringField(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  if (!(key in obj)) return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function getNumberField(obj: unknown, key: string): number | null {
  if (typeof obj !== "object" || obj === null) return null;
  if (!(key in obj)) return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function makeSignature(q: string): Signature {
  const t = q.toLowerCase();

  const hasAny = (words: string[]) => words.some((w) => t.includes(w));

  return {
    anime: hasAny(["anime", "shonen", "isekai", "slice of life"]),
    comedy: hasAny(["comedy", "funny", "humour", "humor", "laugh", "satire"]),
    horror: hasAny([
      "horror",
      "scary",
      "slasher",
      "haunting",
      "ghost",
      "demon",
    ]),
    mystery: hasAny([
      "mystery",
      "detective",
      "whodunit",
      "investigation",
      "case",
    ]),
    trippy: hasAny([
      "trippy",
      "psychedelic",
      "surreal",
      "mind-bending",
      "mind bending",
      "weird",
      "acid",
    ]),
    underrated: hasAny([
      "underrated",
      "hidden gem",
      "hidden gems",
      "gem",
      "gems",
      "under the radar",
    ]),
    badMovie: hasAny([
      "bad movie",
      "so bad",
      "trash",
      "terrible",
      "awful",
      "guilty pleasure",
    ]),
  };
}

function buildGenreWeights(
  mergedMovies: { id: number; genre_ids?: number[] }[],
  likes: string[],
  passes: string[],
) {
  const likeSet = new Set(likes);
  const passSet = new Set(passes);

  const likeCounts = new Map<number, number>();
  const passCounts = new Map<number, number>();

  for (const m of mergedMovies) {
    const idStr = String(m.id);
    const genres = m.genre_ids ?? [];

    if (likeSet.has(idStr)) {
      for (const g of genres) likeCounts.set(g, (likeCounts.get(g) ?? 0) + 1);
    }

    if (passSet.has(idStr)) {
      for (const g of genres) passCounts.set(g, (passCounts.get(g) ?? 0) + 1);
    }
  }

  return { likeCounts, passCounts };
}

function scoreMovie(
  m: {
    overview?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    genre_ids?: number[];
  },
  sig: Signature,
  likeCounts: Map<number, number>,
  passCounts: Map<number, number>,
): number {
  let s = 0;

  const voteAvg = m.vote_average ?? 0;
  const voteCount = m.vote_count ?? 0;
  const popularity = m.popularity ?? 0;

  // Baseline: quality + confidence
  s += voteAvg * 2;
  s += Math.log10(voteCount + 1) * 3;

  // Genre-based intent matching (THIS is the big fix)
  const genres = new Set(m.genre_ids ?? []);
  if (sig.comedy && genres.has(GENRE.comedy)) s += 18;
  if (sig.horror && genres.has(GENRE.horror)) s += 18;
  if (sig.mystery && genres.has(GENRE.mystery)) s += 14;

  // Anime proxy: animation genre
  if (sig.anime && genres.has(GENRE.animation)) s += 10;

  // "Underrated" bias: favour lower popularity while still rated
  if (sig.underrated) {
    s += Math.max(0, 30 - Math.log10(popularity + 1) * 10);
  }

  // "Bad movie" bias: invert some quality preferences
  if (sig.badMovie) {
    s -= voteAvg * 2;
    s += Math.log10(popularity + 1) * 2;
  }

  // Extra text nudges (secondary, not primary)
  const text = (m.overview ?? "").toLowerCase();
  if (
    sig.trippy &&
    (text.includes("surreal") ||
      text.includes("psychedelic") ||
      text.includes("strange"))
  )
    s += 6;

  // Taste shaping: boost genres the user keeps, penalise genres they pass
  // (gentle weights so it guides rather than hijacks)
  const genresArr = m.genre_ids ?? [];
  for (const g of genresArr) {
    const likeBoost = (likeCounts.get(g) ?? 0) * 2; // +2 per like in that genre
    const passPenalty = (passCounts.get(g) ?? 0) * 1; // -1 per pass in that genre
    s += likeBoost;
    s -= passPenalty;
  }

  return s;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get("sessionId")?.value;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const qRaw = getStringField(body, "q") ?? "";
  const q = qRaw.trim();

  const rerollFromBody = getNumberField(body, "reroll");
  const reroll = typeof rerollFromBody === "number" ? rerollFromBody : 0;

  const sig = makeSignature(q);

  const likes =
    typeof body === "object" &&
    body !== null &&
    "likes" in body &&
    Array.isArray((body as Record<string, unknown>).likes)
      ? ((body as Record<string, unknown>).likes as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];

  const passes =
    typeof body === "object" &&
    body !== null &&
    "passes" in body &&
    Array.isArray((body as Record<string, unknown>).passes)
      ? ((body as Record<string, unknown>).passes as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];

  const seenIds = new Set([...likes, ...passes]);

  const genreCsv = sig.comedy
    ? String(GENRE.comedy)
    : sig.horror
      ? String(GENRE.horror)
      : sig.mystery
        ? String(GENRE.mystery)
        : sig.anime
          ? String(GENRE.animation)
          : "";

  const today = new Date();
  const year = today.getFullYear();

  const sliceAStart = `${year - 30}-01-01`;
  const sliceAEnd = `${year - 20}-12-31`;

  const sliceBStart = `${year - 20}-01-01`;
  const sliceBEnd = `${year - 10}-12-31`;

  const [sliceA1, sliceA2, sliceB1, sliceB2] = await Promise.all([
    fetchDiscoverCustom({
      page: 1,
      sort_by: "vote_average.desc",
      vote_count_gte: sig.underrated ? 50 : 200,
      vote_average_gte: 6.5,
      with_genres: genreCsv || undefined,
      primary_release_date_gte: sliceAStart,
      primary_release_date_lte: sliceAEnd,
    }),
    fetchDiscoverCustom({
      page: 2,
      sort_by: "vote_average.desc",
      vote_count_gte: sig.underrated ? 50 : 200,
      vote_average_gte: 6.5,
      with_genres: genreCsv || undefined,
      primary_release_date_gte: sliceAStart,
      primary_release_date_lte: sliceAEnd,
    }),
    fetchDiscoverCustom({
      page: 1,
      sort_by: "vote_average.desc",
      vote_count_gte: sig.underrated ? 50 : 200,
      vote_average_gte: 6.5,
      with_genres: genreCsv || undefined,
      primary_release_date_gte: sliceBStart,
      primary_release_date_lte: sliceBEnd,
    }),
    fetchDiscoverCustom({
      page: 2,
      sort_by: "vote_average.desc",
      vote_count_gte: sig.underrated ? 50 : 200,
      vote_average_gte: 6.5,
      with_genres: genreCsv || undefined,
      primary_release_date_gte: sliceBStart,
      primary_release_date_lte: sliceBEnd,
    }),
  ]);

  // merge + de-dupe by TMDB id
  const byId = new Map<number, (typeof sliceA1)[number]>();

  const merged = [...sliceA1, ...sliceA2, ...sliceB1, ...sliceB2];

  for (const m of merged) {
    byId.set(m.id, m);
  }

  const { likeCounts, passCounts } = buildGenreWeights(merged, likes, passes);

  const minVotes = sig.underrated ? 50 : 200;

  // In gems mode, avoid ultra-mainstream by excluding very high popularity titles
  const maxPopularity = sig.underrated ? 60 : Infinity;

  const candidates = Array.from(byId.values())
    .filter((m) => m.poster_path)
    .filter((m) => (m.vote_count ?? 0) >= minVotes)
    .filter((m) => (m.popularity ?? 0) <= maxPopularity)
    .filter((m) => !seenIds.has(String(m.id)));

  // Hard-filter for clear single-genre intents (prevents "random classics" for simple prompts)
  let filtered = candidates;

  const intentCount = [sig.anime, sig.comedy, sig.horror, sig.mystery].filter(
    Boolean,
  ).length;

  const isSingleGenreIntent =
    intentCount === 1 && !sig.underrated && !sig.badMovie;

  if (isSingleGenreIntent) {
    if (sig.comedy)
      filtered = filtered.filter((m) =>
        (m.genre_ids ?? []).includes(GENRE.comedy),
      );
    if (sig.horror)
      filtered = filtered.filter((m) =>
        (m.genre_ids ?? []).includes(GENRE.horror),
      );
    if (sig.mystery)
      filtered = filtered.filter((m) =>
        (m.genre_ids ?? []).includes(GENRE.mystery),
      );
    if (sig.anime)
      filtered = filtered.filter((m) =>
        (m.genre_ids ?? []).includes(GENRE.animation),
      );

    // Safety fallback: if filter becomes too small, revert to unfiltered candidates
    if (filtered.length < 25) filtered = candidates;
  }

  const day = new Date().toDateString();
  const seed = hashStringToSeed(`${sessionId}:${day}:${reroll}`);
  const rand = mulberry32(seed);
  // Rank candidates based on the prompt signature
  const ranked = filtered
    .map((m) => ({ m, s: scoreMovie(m, sig, likeCounts, passCounts) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);

  const topBucket = ranked.slice(0, 60);
  const midBucket = ranked.slice(60, 220);

  shuffleInPlace(topBucket, rand);
  shuffleInPlace(midBucket, rand);

  let picked = [...topBucket.slice(0, 6), ...midBucket.slice(0, 4)];

  // Fallback: if filters make midBucket too small, top up from ranked
  if (picked.length < 10) {
    const seen = new Set(picked.map((m) => m.id));
    for (const m of ranked) {
      if (picked.length >= 10) break;
      if (!seen.has(m.id)) {
        picked.push(m);
        seen.add(m.id);
      }
    }
  }

  // Final safety: cap at 10
  picked = picked.slice(0, 10);

  const cards: DeckCard[] = picked.map((m) => ({
    id: String(m.id),
    title: m.title,
    year: yearFromDate(m.release_date),
    kind: "movie",
    reason: sig.underrated
      ? "Underrated pick"
      : sig.badMovie
        ? "So-bad-it’s-good energy"
        : sig.trippy
          ? "Trippy vibes match"
          : sig.comedy
            ? "Comedy match"
            : sig.horror
              ? "Horror match"
              : sig.mystery
                ? "Mystery match"
                : "Curated pick",

    posterPath: m.poster_path,
  }));

  const response = NextResponse.json({
    interpretedAs: `sig=${JSON.stringify(sig)}`,
    cards,
  });

  if (!cookieStore.get("sessionId")?.value) {
    response.cookies.set("sessionId", sessionId, {
      httpOnly: true,
      path: "/",
    });
  }

  return response;
}
