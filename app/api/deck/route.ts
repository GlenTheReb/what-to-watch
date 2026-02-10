import { NextResponse } from "next/server";

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
};

export async function POST() {
  const cards: DeckCard[] = Array.from({ length: 10 }, (_, i) => ({
    id: `fake-${i + 1}`,
    title: `Example Pick ${i + 1}`,
    year: 2000 + i,
    kind: i % 2 === 0 ? "movie" : "tv",
    reason: "Placeholder result from /api/deck",
  }));

  return NextResponse.json({
    interpretedAs: "placeholder",
    cards,
  });
}
