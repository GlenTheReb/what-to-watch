"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";

type DeckCard = {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "tv";
  reason: string;
  voteAverage: number;
  posterPath: string | null;
  genres: string[];
  director: string | null;
  cast: string[];
  parentalRating?: string | null;
  watchProviders?: { provider_name: string; logo_path: string }[];
  watchLink?: string;
  language?: string;
  trailerUrl?: string | null;
};

const LS_LIKES = "wtw:likes";
const LS_PASSES = "wtw:passes";

const LOADING_TEXTS = [
  "Analyzing your mood...",
  "Scanning the cinematic universe...",
  "Consulting the movie gods...",
  "Bribing the critics...",
  "Popping the popcorn...",
  "Curating a masterpiece...",
  "Waking up the directors..."
];

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

function DeckContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "trending movies";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [index, setIndex] = useState(0);
  const [reroll, setReroll] = useState(0);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [passes, setPasses] = useState<Set<string>>(new Set());
  const [countryCode, setCountryCode] = useState("US");
  const [hasFetched, setHasFetched] = useState(false);
  const [direction, setDirection] = useState(0);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  const current = cards[index];

  useEffect(() => {
    setLikes(loadSet(LS_LIKES));
    setPasses(loadSet(LS_PASSES));
    fetch("https://ipapi.co/country/")
      .then((res) => res.text())
      .then((text) => {
        if (text && text.length === 2) setCountryCode(text.toUpperCase());
      })
      .catch(() => {})
      .finally(() => {
        setHasFetched(true);
      });
  }, []);

  useEffect(() => {
    if (hasFetched && cards.length === 0) {
      getPicks();
    }
  }, [hasFetched]);

  // Loading text cycler
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && cards.length === 0) {
      interval = setInterval(() => {
        setLoadingTextIndex((prev) => (prev + 1) % LOADING_TEXTS.length);
      }, 2000);
    } else {
      setLoadingTextIndex(0);
    }
    return () => clearInterval(interval);
  }, [loading, cards.length]);

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
          countryCode,
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
    setDirection(1);
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
    setDirection(-1);
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
    setCards([]);
    setIndex(0);
    setDirection(0);

    const next = reroll + 1;
    setReroll(next);

    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query,
          reroll: next,
          countryCode,
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

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : direction < 0 ? -300 : 0,
      opacity: 0,
      scale: 0.9,
      rotate: direction > 0 ? 10 : direction < 0 ? -10 : 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction > 0 ? 300 : direction < 0 ? -300 : 0, // exit left for pass, right for keep
      opacity: 0,
      scale: 0.9,
      rotate: direction * 15,
    })
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const isInitialLoading = loading && cards.length === 0;

  return (
    <main className="min-h-[100dvh] flex flex-col items-center py-8 bg-background text-foreground overflow-hidden relative">
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-plum-500/10 rounded-full blur-[100px] pointer-events-none" 
      />
      
      <div className={`w-full max-w-md px-4 flex flex-col relative z-10 h-full flex-1 ${isInitialLoading ? 'items-center justify-center' : 'items-center'}`}>
        
        {/* Hide header while initially loading to show full screen big loader */}
        {!isInitialLoading && (
          <>
            <button
              onClick={() => router.push("/")}
              className="mb-6 text-sm text-plum-300/70 hover:text-plum-100 flex items-center gap-1 self-start transition-colors"
            >
              &larr; Search again
            </button>

            <h2 className="text-2xl font-semibold text-plum-100 mb-6 w-full text-left truncate tracking-tight drop-shadow-sm">
              &quot;{query}&quot;
            </h2>
          </>
        )}

        {error && <p className="text-red-400 text-sm w-full">{error}</p>}
        
        {isInitialLoading && (
          <motion.div 
            key="loading-view"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center space-y-8 w-full"
          >
            <div className="relative w-32 h-32 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-t-4 border-plum-400 opacity-80"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-4 rounded-full border-b-4 border-plum-500 opacity-60"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-12 h-12 bg-plum-400 rounded-full blur-md opacity-50"
              />
            </div>
            
            <AnimatePresence mode="wait">
              <motion.p
                key={loadingTextIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-xl md:text-2xl font-medium text-plum-200 tracking-wide text-center px-4"
              >
                {LOADING_TEXTS[loadingTextIndex]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {!isInitialLoading && (
          <div className="w-full relative flex-1 min-h-[500px] perspective-1000 mt-2 mb-4">
            <AnimatePresence initial={false} custom={direction}>
              {cards.length > 0 && index < cards.length && current && (
                <motion.div 
                  key={current.id}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.8}
                  onDragEnd={(e, { offset, velocity }) => {
                    const swipe = swipePower(offset.x, velocity.x);
                    if (swipe < -swipeConfidenceThreshold) {
                      pass();
                    } else if (swipe > swipeConfidenceThreshold) {
                      keep();
                    }
                  }}
                  className="absolute w-full max-h-full overflow-y-auto rounded-2xl border border-plum-400/20 bg-plum-950/80 backdrop-blur-xl p-5 text-left space-y-3 shadow-2xl cursor-grab active:cursor-grabbing scrollbar-hide"
                >
                  {/* Poster */}
                  {current.posterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w500${current.posterPath}`}
                      alt={`${current.title} poster`}
                      className="w-full h-auto max-h-[250px] object-cover rounded-xl mb-3 shadow-lg pointer-events-none border border-plum-800/50"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-[300px] rounded-xl mb-3 bg-plum-900/50 border border-plum-800/50 flex items-center justify-center text-plum-300 text-sm shadow-inner pointer-events-none">
                      No poster
                    </div>
                  )}

                  {/* Header row */}
                  <div className="flex items-center justify-between pointer-events-none">
                    <span className="text-xs text-plum-300/70 font-medium">
                      Card {index + 1} / {cards.length}
                    </span>
                    <div className="flex items-center gap-2">
                      {current.language && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-plum-400/20 text-plum-300 font-bold bg-plum-800/20">
                          {current.language}
                        </span>
                      )}
                      {current.parentalRating && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-plum-400/30 text-plum-200 font-bold uppercase bg-plum-800/30">
                          {current.parentalRating}
                        </span>
                      )}
                      <span className="text-xs text-plum-300/70 font-medium tracking-wide">
                        {current.kind.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Title + rating */}
                  <div className="pointer-events-none">
                    <div className="text-xl font-bold tracking-tight text-plum-100">
                      {current.title}{" "}
                      <span className="text-plum-400/70 font-normal">({current.year})</span>
                    </div>
                    {current.voteAverage > 0 && (
                      <div className="text-sm text-yellow-500 font-semibold drop-shadow-sm mt-0.5">
                        {current.voteAverage.toFixed(1)}★
                      </div>
                    )}
                  </div>

                  {/* Genres */}
                  {current.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pointer-events-none">
                      {current.genres.map((g) => (
                        <span
                          key={g}
                          className="text-xs px-2.5 py-1 rounded-full bg-plum-800/40 text-plum-200 border border-plum-400/20 backdrop-blur-sm"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Director & Cast */}
                  {(current.director || current.cast.length > 0) && (
                    <div className="mt-2 space-y-1 text-sm text-plum-200/80 pointer-events-none">
                      {current.director && (
                        <div className="flex items-center gap-2">
                          <span className="text-plum-400/50">🎬</span> {current.director}
                        </div>
                      )}
                      {current.cast.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-plum-400/50">🎭</span>{" "}
                          <span className="truncate">{current.cast.slice(0, 3).join(", ")}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Why this? */}
                  <div className="mt-2 bg-plum-900/20 p-3 rounded-xl border border-plum-400/10 pointer-events-none">
                    <span className="text-xs font-bold text-plum-300 uppercase tracking-wider block mb-1">
                      Why {current.title}?
                    </span>
                    <p className="text-sm text-plum-100/90 leading-relaxed line-clamp-4">{current.reason}</p>
                  </div>

                  {/* Watch Options */}
                  <div className="mt-3 pt-3 border-t border-plum-400/10 flex justify-between items-center" onPointerDown={(e) => e.stopPropagation()}>
                    {current.watchLink ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-plum-400/70 block mb-2 uppercase tracking-wide">
                          Where to watch
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {current.watchProviders && current.watchProviders.length > 0 ? (
                            current.watchProviders.slice(0, 4).map((p) => (
                              <a
                                key={p.provider_name}
                                href={current.watchLink}
                                target="_blank"
                                rel="noreferrer"
                                className="transition-transform hover:scale-110"
                                title={`Watch on ${p.provider_name}`}
                              >
                                <img
                                  src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                                  alt={p.provider_name}
                                  className="w-8 h-8 rounded shadow-sm border border-plum-400/20"
                                />
                              </a>
                            ))
                          ) : (
                            <a
                              href={current.watchLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-plum-300 hover:text-plum-100 underline transition-colors"
                            >
                              Find where to rent or buy
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}

                    {current.trailerUrl && (
                      <a 
                        href={current.trailerUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-plum-800/50 hover:bg-plum-700/50 border border-plum-400/20 text-plum-100 text-xs font-semibold transition-colors mt-4 self-end"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Trailer
                      </a>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Buttons (always pinned below cards) */}
        {!isInitialLoading && cards.length > 0 && index < cards.length && (
          <div className="w-full flex gap-4 mt-auto px-4 z-20 pb-4 flex-shrink-0">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={pass}
              className="flex-1 py-4 rounded-2xl border-2 border-plum-500/30 text-plum-300 font-bold tracking-wide hover:bg-plum-900/30 hover:border-plum-400 transition-colors shadow-lg"
            >
              Pass
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(181,107,194,0.4)" }}
              whileTap={{ scale: 0.95 }}
              onClick={keep}
              className="flex-1 py-4 rounded-2xl bg-gradient-to-br from-plum-100 to-white text-plum-950 font-bold tracking-wide shadow-xl shadow-plum-500/20 border border-white/50"
            >
              Keep
            </motion.button>
          </div>
        )}

        {!isInitialLoading && cards.length > 0 && index >= cards.length && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-2xl border border-plum-400/20 bg-plum-950/50 backdrop-blur-xl p-8 text-plum-100 w-full text-center shadow-2xl flex flex-col items-center"
          >
            <p className="text-xl font-bold mb-2">Done swiping!</p>
            <p className="text-plum-300 mb-6">You've reached the end of this deck.</p>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={rerollPicks}
              disabled={loading}
              className="w-full flex items-center justify-center px-6 py-4 rounded-xl bg-plum-800 text-plum-100 font-bold border border-plum-400/20 hover:bg-plum-700 disabled:opacity-60 transition-colors shadow-lg"
            >
              {loading && (
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-plum-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {loading ? "Curating more..." : "Draw 10 More"}
            </motion.button>
          </motion.div>
        )}
      </div>
    </main>
  );
}

export default function DeckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DeckContent />
    </Suspense>
  );
}
