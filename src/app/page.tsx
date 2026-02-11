"use client";

import { useState } from "react";

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
  posterPath: string | null;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [index, setIndex] = useState(0);

  const current = cards[index];

  async function getPicks() {
    setLoading(true);
    setError(null);
    setCards([]);
    setIndex(0);

    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // we’re not using this server-side yet, but keep it ready
        body: JSON.stringify({ q: query }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = (await res.json()) as { cards: DeckCard[] };
      setCards(data.cards ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function keep() {
    // later: store in localStorage watchlist
    setIndex((i) => Math.min(i + 1, cards.length));
  }

  function pass() {
    setIndex((i) => Math.min(i + 1, cards.length));
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-md text-center space-y-4 px-4">
        <h1 className="text-4xl font-bold">What to watch</h1>
        <p className="text-gray-400">Stop scrolling. Start watching.</p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type anything…"
          className="mt-6 w-full px-4 py-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:border-white"
        />

        <button
          onClick={getPicks}
          disabled={loading}
          className="block mx-auto mt-4 px-6 py-3 bg-white text-black rounded font-medium disabled:opacity-60"
        >
          {loading ? "Getting picks…" : "Get picks"}
        </button>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {cards.length > 0 && index < cards.length && current && (
          <div className="mt-8 rounded border border-gray-700 bg-gray-950 p-4 text-left space-y-2">
            {/* Poster */}
            {current.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://image.tmdb.org/t/p/w500${current.posterPath}`}
                alt={`${current.title} poster`}
                className="w-full rounded mb-3 border border-gray-800"
                loading="lazy"
              />
            ) : (
              <div className="w-full aspect-[2/3] rounded mb-3 bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 text-sm">
                No poster
              </div>
            )}

            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Card {index + 1} / {cards.length}
              </span>
              <span className="text-xs text-gray-400">
                {current.kind.toUpperCase()}
              </span>
            </div>

            {/* Title */}
            <div className="text-lg font-semibold">
              {current.title}{" "}
              <span className="text-gray-400">({current.year})</span>
            </div>

            {/* Reason */}
            <div className="text-sm text-gray-400">{current.reason}</div>

            {/* Buttons */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={pass}
                className="flex-1 px-4 py-2 rounded border border-gray-700 hover:border-gray-500"
              >
                Pass
              </button>
              <button
                onClick={keep}
                className="flex-1 px-4 py-2 rounded bg-white text-black font-medium"
              >
                Keep
              </button>
            </div>
          </div>
        )}

        {cards.length > 0 && index >= cards.length && (
          <div className="mt-8 rounded border border-gray-700 bg-gray-950 p-4 text-gray-300">
            Done. Try another prompt.
          </div>
        )}
      </div>
    </main>
  );
}
