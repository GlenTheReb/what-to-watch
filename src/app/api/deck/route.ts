import { NextResponse } from "next/server";
import {
  fetchDiscoverMovies,
  fetchTrendingMovies,
  fetchTopRatedMovies,
} from "@/lib/tmdb";
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

function scoreMovie(
  m: {
    overview?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
  },
  sig: Signature,
): number {
  let s = 0;

  const voteAvg = m.vote_average ?? 0;
  const voteCount = m.vote_count ?? 0;
  const popularity = m.popularity ?? 0;

  // Baseline: quality + confidence (log vote count so it doesn’t dominate)
  s += voteAvg * 2;
  s += Math.log10(voteCount + 1) * 3;

  // "Underrated" bias: favour lower popularity while still rated
  if (sig.underrated) {
    s += Math.max(0, 30 - Math.log10(popularity + 1) * 10); // lower popularity → higher boost
  }

  // "Bad movie" bias: invert some quality preferences
  if (sig.badMovie) {
    s -= voteAvg * 2;
    s += Math.log10(popularity + 1) * 2; // popular bad movies tend to be “fun bad”
  }

  const text = (m.overview ?? "").toLowerCase();

  // Soft matching (works surprisingly well even with just overviews)
  if (sig.comedy && (text.includes("comedy") || text.includes("hilarious")))
    s += 6;
  if (
    sig.horror &&
    (text.includes("horror") ||
      text.includes("terror") ||
      text.includes("killer"))
  )
    s += 6;
  if (
    sig.mystery &&
    (text.includes("mystery") ||
      text.includes("detective") ||
      text.includes("investigation"))
  )
    s += 6;
  if (
    sig.trippy &&
    (text.includes("surreal") ||
      text.includes("psychedelic") ||
      text.includes("strange"))
  )
    s += 6;

  // “Anime” is not reliably detectable from overview; treat it as a weak hint for now
  if (sig.anime && (text.includes("animated") || text.includes("animation")))
    s += 2;

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

  const [discover1, discover2, trending, topRated1, topRated2] =
    await Promise.all([
      fetchDiscoverMovies(1),
      fetchDiscoverMovies(2),
      fetchTrendingMovies(),
      fetchTopRatedMovies(1),
      fetchTopRatedMovies(2),
    ]);

  // merge + de-dupe by TMDB id
  const byId = new Map<number, (typeof discover1)[number]>();

  const merged = sig.underrated
    ? [...discover1, ...discover2] // avoid topRated/trending for gems mode
    : [...trending, ...topRated1, ...topRated2, ...discover1, ...discover2];

  for (const m of merged) {
    byId.set(m.id, m);
  }

  const minVotes = sig.underrated ? 50 : 200;

  // In gems mode, avoid ultra-mainstream by excluding very high popularity titles
  const maxPopularity = sig.underrated ? 60 : Infinity;

  const candidates = Array.from(byId.values())
    .filter((m) => m.poster_path)
    .filter((m) => (m.vote_count ?? 0) >= minVotes)
    .filter((m) => (m.popularity ?? 0) <= maxPopularity);

  const day = new Date().toDateString();
  const seed = hashStringToSeed(`${sessionId}:${day}:${reroll}`);
  const rand = mulberry32(seed);
  // Rank candidates based on the prompt signature
  const ranked = candidates
    .map((m) => ({ m, s: scoreMovie(m, sig) }))
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
    reason: trending.some((t) => t.id === m.id)
      ? "Trending this week"
      : topRated1.some((t) => t.id === m.id)
        ? "Highly rated"
        : sig.underrated
          ? "Underrated pick"
          : "Popular with strong vote count",
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
