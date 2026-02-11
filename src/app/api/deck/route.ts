import { NextResponse } from "next/server";
import { fetchDiscoverMovies } from "@/lib/tmdb";

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
  // For now: ignore user input and just return 10 good picks.
  // Next step later: use Gemini to turn input into filters.
  const page1 = await fetchDiscoverMovies(1);
  const page2 = await fetchDiscoverMovies(2);

  const candidates = [...page1, ...page2]
    .filter((m) => m.poster_path) // nicer UX
    .slice(0, 50);

  const cards: DeckCard[] = candidates.slice(0, 10).map((m) => ({
    id: String(m.id),
    title: m.title,
    year: yearFromDate(m.release_date),
    kind: "movie",
    reason: "Popular with strong vote count",
    posterPath: m.poster_path,
  }));

  return NextResponse.json({
    interpretedAs: "tmdb:discover (placeholder logic)",
    cards,
  });
}
