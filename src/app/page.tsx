"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/deck?q=${encodeURIComponent(query)}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-md text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">What to watch</h1>
        <p className="text-gray-400 text-lg">Stop scrolling. Start watching.</p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="movies that make me feel evil..."
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
    </main>
  );
}
