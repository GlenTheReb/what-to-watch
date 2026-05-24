"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const PLACEHOLDERS = [
  "movies that make me feel evil...",
  "shows like Breaking Bad but in space...",
  "dark sci-fi from the 90s...",
  "movies starring Tom Hanks...",
  "what's trending this week...",
  "hidden gem horror movies...",
  "a heist movie with a lot of plot twists...",
  "anime about cooking...",
  "a feel-good movie for a rainy day...",
  "movies like Inception but less confusing...",
  "a really good documentary about cults...",
  "shows with a smart detective...",
  "fantasy movies with epic battles...",
  "something to watch with my grandparents...",
  "a dystopian society where music is banned...",
  "underrated 80s action movies...",
  "a show about time travel that actually makes sense...",
  "movies where the villain wins...",
  "a visually stunning animated film...",
  "something funny to watch while eating..."
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [placeholder, setPlaceholder] = useState("what are you in the mood for?...");
  const router = useRouter();

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * PLACEHOLDERS.length);
    setPlaceholder(PLACEHOLDERS[randomIndex]);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/deck?q=${encodeURIComponent(query)}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-4 relative">
      <div className="w-full max-w-md text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">What to watch</h1>
        <p className="text-gray-400 text-lg">Stop scrolling. Start watching.</p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-4 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all text-lg"
            autoFocus
          />

          <button
            type="submit"
            disabled={!query.trim()}
            className="mt-6 px-8 py-3 bg-white text-black rounded font-semibold disabled:opacity-50 hover:bg-gray-200 transition-colors text-lg"
          >
            Get picks
          </button>
        </form>
      </div>

      <div className="absolute bottom-6 text-center text-xs text-gray-600 max-w-sm px-4">
        This product uses the TMDB API but is not endorsed or certified by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400 transition-colors">TMDB</a>.
      </div>
    </main>
  );
}
