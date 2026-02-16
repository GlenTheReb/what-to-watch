"use client";

import { useEffect, useState } from "react";

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
  posterPath: string | null;
};

const LS_LIKES = "wtw:likes";
const LS_PASSES = "wtw:passes";

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage issues
  }
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [index, setIndex] = useState(0);
  const [reroll, setReroll] = useState(0);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [passes, setPasses] = useState<Set<string>>(new Set());

  const current = cards[index];

  useEffect(() => {
    setLikes(loadSet(LS_LIKES));
    setPasses(loadSet(LS_PASSES));
  }, []);

  async function getPicks() {
    setLoading(true);
    setError(null);
    setCards([]);
    setIndex(0);
    setReroll(0);

    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query,
          reroll: 0,
          likes: Array.from(likes).slice(-200),
          passes: Array.from(passes).slice(-200),
        }),
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
    if (!current) return;

    setLikes((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      saveSet(LS_LIKES, next);
      return next;
    });

    setIndex((i) => Math.min(i + 1, cards.length));
  }

  function pass() {
    if (!current) return;

    setPasses((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      saveSet(LS_PASSES, next);
      return next;
    });

    setIndex((i) => Math.min(i + 1, cards.length));
  }

  async function rerollPicks() {
    setLoading(true);
    setError(null);
    setIndex(0);

    const next = reroll + 1;
    setReroll(next);

    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query,
          reroll: next,
          likes: Array.from(likes).slice(-200),
          passes: Array.from(passes).slice(-200),
        }),
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
              <div className="w-full aspect-2/3 rounded mb-3 bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 text-sm">
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
              <button
                onClick={rerollPicks}
                disabled={loading || cards.length === 0}
                className="w-full mt-3 px-4 py-2 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-60"
              >
                Another 10
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
