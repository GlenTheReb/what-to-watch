"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";

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

const LOADING_TEXTS = [
  "Analyzing your mood...",
  "Scanning the cinematic universe...",
  "Consulting the movie gods...",
  "Bribing the critics...",
  "Popping the popcorn...",
  "Curating a masterpiece...",
  "Waking up the directors..."
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [placeholder, setPlaceholder] = useState("what are you in the mood for?...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * PLACEHOLDERS.length);
    setPlaceholder(PLACEHOLDERS[randomIndex]);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSubmitting) {
      interval = setInterval(() => {
        setLoadingTextIndex((prev) => (prev + 1) % LOADING_TEXTS.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isSubmitting]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSubmitting(true);
    setTimeout(() => {
      router.push(`/deck?q=${encodeURIComponent(query)}`);
    }, 500); 
  }

  return (
    <main className="min-h-[100dvh] flex flex-col bg-background text-foreground px-4 relative overflow-hidden">
      <motion.div 
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-plum-500/20 rounded-[100%] blur-[120px] pointer-events-none" 
      />

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto text-center space-y-6 relative z-10 pb-20">
        <AnimatePresence mode="wait">
          {!isSubmitting ? (
            <motion.div 
              key="form-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              transition={{ duration: 0.5 }}
              className="w-full flex flex-col items-center justify-center"
            >
              <div className="space-y-4 mb-12">
                <h1 className="text-6xl md:text-8xl font-outfit font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-plum-100 to-plum-400 pb-2 drop-shadow-lg">
                  What to watch
                </h1>
                <p className="text-plum-300 text-xl md:text-2xl font-outfit font-medium tracking-wide">Stop scrolling. Start watching.</p>
              </div>

              <form onSubmit={onSubmit} className="w-full flex justify-center max-w-2xl relative group">
                {/* Input glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-plum-500 to-plum-400 rounded-full blur-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-700" />
                
                <div className="relative w-full flex items-center bg-plum-900/60 backdrop-blur-2xl border-0 rounded-full shadow-[0_0_40px_rgba(181,107,194,0.15)] focus-within:ring-2 focus-within:ring-plum-400/60 transition-all duration-300 p-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent px-6 py-4 outline-none text-lg md:text-xl font-light placeholder:text-plum-300/50 text-plum-100"
                    autoFocus
                  />
                  <motion.button
                    whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(181,107,194,0.6)" }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={!query.trim()}
                    className="p-4 bg-plum-100 text-plum-950 rounded-full disabled:opacity-50 transition-all mr-1 shadow-md"
                    title="Find My Next Watch"
                  >
                    <Search className="w-6 h-6 stroke-[2.5px]" />
                  </motion.button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              key="loading-view"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center space-y-8"
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
                  className="text-2xl font-medium text-plum-200 tracking-wide text-center"
                >
                  {LOADING_TEXTS[loadingTextIndex]}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full text-center text-xs text-plum-400/50 max-w-sm mx-auto mt-4 pb-2 space-y-1 relative z-10">
        <p>Built by Glen Rebello as a personal portfolio project. Licensed under MIT.</p>
        <p>This product uses the TMDB API but is not endorsed or certified by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-plum-400 transition-colors">TMDB</a>.</p>
      </div>
    </main>
  );
}
