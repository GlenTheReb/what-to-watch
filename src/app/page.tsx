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
    <main className="min-h-[100dvh] flex flex-col bg-black text-white px-4 relative overflow-hidden">
      {/* Subtle background glow effect */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-white/5 rounded-[100%] blur-[120px] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto text-center space-y-6 relative z-10 pb-20">
        <div className="space-y-4">
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 pb-2">
            What to watch
          </h1>
          <p className="text-gray-400 text-xl md:text-2xl font-medium tracking-wide">Stop scrolling. Start watching.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-16 w-full flex flex-col items-center gap-8">
          <div className="relative w-full group">
            {/* Input glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-gray-500 to-gray-400 rounded-3xl blur-xl opacity-10 group-hover:opacity-20 transition-opacity duration-700" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="relative w-full px-8 py-6 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all text-xl md:text-2xl font-light placeholder:text-gray-600 shadow-2xl"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!query.trim()}
            className="px-12 py-5 bg-white text-black rounded-full font-bold tracking-wide disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-all duration-300 text-lg shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
          >
            Get Recommendations
          </button>
        </form>
      </div>

      <div className="w-full text-center text-xs text-gray-600 max-w-sm mx-auto mt-4 pb-2 space-y-1">
        <p>Built by Glen Rebello as a personal portfolio project. Licensed under MIT.</p>
        <p>This product uses the TMDB API but is not endorsed or certified by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400 transition-colors">TMDB</a>.</p>
      </div>
    </main>
  );
}
