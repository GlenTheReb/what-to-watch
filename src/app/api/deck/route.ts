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

export async function POST() {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get("sessionId")?.value;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }

  const [discover1, trending, topRated1] = await Promise.all([
    fetchDiscoverMovies(1),
    fetchTrendingMovies(),
    fetchTopRatedMovies(1),
  ]);

  // merge + de-dupe by TMDB id
  const byId = new Map<number, (typeof discover1)[number]>();
  for (const m of [...trending, ...topRated1, ...discover1]) {
    byId.set(m.id, m);
  }

  const candidates = Array.from(byId.values())
    .filter((m) => m.poster_path)
    .filter((m) => m.vote_count >= 200); // keep quality baseline

  const seed = hashStringToSeed(sessionId + new Date().toDateString());
  const rand = mulberry32(seed);
  shuffleInPlace(candidates, rand);

  // take 10
  const cards: DeckCard[] = candidates.slice(0, 10).map((m) => ({
    id: String(m.id),
    title: m.title,
    year: yearFromDate(m.release_date),
    kind: "movie",
    reason: trending.some((t) => t.id === m.id)
      ? "Trending this week"
      : topRated1.some((t) => t.id === m.id)
        ? "Highly rated"
        : "Popular with strong vote count",
    posterPath: m.poster_path,
  }));

  const response = NextResponse.json({
    interpretedAs: "tmdb mix: trending + top rated + discover",
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
