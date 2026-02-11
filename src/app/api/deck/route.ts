import { NextResponse } from "next/server";
import { fetchDiscoverMovies, fetchTrendingMovies, fetchTopRatedMovies } from "@/lib/tmdb";

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

export async function POST() {
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

  // small shuffle so refresh isn't identical
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // take 10
  const cards: DeckCard[] = candidates.slice(0, 10).map((m) => ({
    id: String(m.id),
    title: m.title,
    year: yearFromDate(m.release_date),
    kind: "movie",
    reason:
      trending.some((t) => t.id === m.id)
        ? "Trending this week"
        : topRated1.some((t) => t.id === m.id)
        ? "Highly rated"
        : "Popular with strong vote count",
    posterPath: m.poster_path,
  }));

  return NextResponse.json({
    interpretedAs: "tmdb mix: trending + top rated + discover",
    cards,
  });
}

