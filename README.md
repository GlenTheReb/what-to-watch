# 🎬 What to Watch

> Stop scrolling. Start watching.

An AI-powered movie & TV recommendation engine that actually understands what you're in the mood for. Type a vibe, a reference, a genre, a decade — or just "something like Breaking Bad" — and get 10 curated picks ranked by real signal, not popularity noise.

Built on **Next.js**, **Gemini AI**, **TMDB**, and **Upstash Redis**.

---

## ✨ What Makes This Different

Most recommendation apps either reshuffle popular titles or let an LLM hallucinate a list.

**What to Watch** takes a hybrid approach:

1. **Gemini parses your intent** — natural language → structured query (genres, moods, themes, keywords, reference titles, people).
2. **TMDB provides the ground truth** — candidates are sourced from real data via targeted API strategies (discover, recommendations, person credits, trending, etc.).
3. **A deterministic scoring pipeline ranks everything** — thematic overlap, genre matching, quality signals, decade alignment, user taste history.
4. **Gemini explains each pick** — every card gets a personalized "Why this?" reason generated from cast, crew, and plot context.

No hallucinated titles. No accounts. No database. Just good recommendations.

---

## 🧠 How It Works

```
User prompt
    │
    ▼
┌──────────────────────┐
│  Gemini Flash (Lite)  │  ← NLP intent parsing
│  Intent Parser        │     genres, mood, themes, keywords,
│                       │     reference titles, people, strategies
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Strategy Router      │  ← Selects data-fetching pipelines
│                       │     based on parsed intent
│  • discover           │
│  • recommendations    │
│  • person_credits     │
│  • trending / popular │
│  • top_rated          │
│  • upcoming           │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  TMDB API             │  ← All candidates come from real data
│  (Cached via Redis)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Scoring Pipeline     │  ← Deterministic ranking
│                       │     thematic hits, genre overlap,
│  • Quality signals    │     source bonuses, decade match,
│  • Keyword matching   │     mood nudges, user taste weights
│  • Source weighting   │
│  • User taste model   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Credits Enrichment   │  ← Fetches cast + director per title
│  + Gemini "Why X?"    │     AI generates personalized reasons
└──────────┬───────────┘
           │
           ▼
     10 ranked cards
     with AI reasoning
```

---

## 🚀 Features

| Feature | Description |
|---|---|
| **Natural language input** | Ask for anything — "dark sci-fi from the 90s", "movies starring Tom Hanks", "shows like The Wire" |
| **AI intent parsing** | Gemini Flash extracts genres, moods, themes, keywords, people, decades, and quality preferences |
| **Multi-strategy routing** | Automatically selects the right TMDB endpoints based on what you asked for |
| **Deterministic scoring** | Every candidate is scored on thematic relevance, genre match, quality, and user history |
| **"Why this?" reasoning** | Each card includes an AI-generated explanation connecting the title to your request |
| **Keep / Pass learning** | Swipe actions build genre-weighted preference maps that reshape future rankings |
| **No repeats** | Seen titles are excluded across sessions via localStorage |
| **Reroll support** | "Another 10" generates a fresh deck using seeded PRNG for variety |
| **Anime-aware filtering** | Requests for anime filter to Japanese-origin animated content — no Western cartoons |
| **Live-action guard** | Non-animation queries automatically exclude animated content |
| **Redis caching** | All TMDB responses and Gemini intents are cached to minimize API calls |
| **Stateless design** | No accounts, no database — preferences live in localStorage + session cookies |

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TailwindCSS 4 |
| AI | Google Gemini 3.1 Flash Lite (`@google/generative-ai`) |
| Data | TMDB API v3 |
| Cache | Upstash Redis (`@upstash/redis`) |
| Language | TypeScript 5 |

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── deck/
│   │       └── route.ts      # Core recommendation API endpoint
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Client-side swipe UI
└── lib/
    ├── cache.ts               # Redis get/set wrapper
    ├── gemini.ts              # Intent parsing + "Why X?" generation
    ├── redis.ts               # Upstash Redis client
    └── tmdb.ts                # All TMDB API integrations
```

### Key Modules

**`gemini.ts`** — Two AI functions:
- `interpretPrompt()` — Parses natural language into a `ParsedIntent` struct (genres, mood, themes, keywords, reference titles, people, strategies, media type, quality). Falls back to regex-based extraction if no API key is set.
- `generateWhyReasons()` — Takes the final 10 picks with their cast/crew data and generates personalized "Why this?" explanations in a single batch call.

**`tmdb.ts`** — Comprehensive TMDB wrapper covering:
- Movie & TV Discover (with keyword, genre, date range, and quality filters)
- Multi-search, keyword search, person search
- Title-based recommendations
- Person credits (filmography)
- Title credits (cast + director extraction for "Why X?" enrichment)
- Trending, popular, top-rated, and upcoming endpoints

**`route.ts`** — The `/api/deck` POST handler orchestrating the full pipeline:
1. Parse intent via Gemini
2. Route to TMDB strategies based on intent
3. Fetch all candidates in parallel
4. De-duplicate, filter (anime, media type, genre, seen IDs)
5. Score and rank deterministically
6. Shuffle a variety pool with seeded PRNG
7. Fetch credits for the final 10
8. Generate AI reasoning via Gemini
9. Return cards with fallback to template-based reasons

---

## 📊 Scoring System

Each candidate is scored using a composite of signals:

| Signal | Points | Notes |
|---|---|---|
| Theme/keyword hits in overview | +12–15 each | Primary relevance signal |
| Multiple thematic hits (2+/3+) | +10/+20 bonus | Compounds relevance |
| TMDB recommendation source | +35–120 | Higher if thematically validated |
| Person credits source | +40 | Actor/director match |
| Targeted discover source | +40 | Keywords + genres combined |
| Keyword discover source | +25 | Keywords only |
| Genre overlap | +15 per match | Deduplicated for TV genre aliasing |
| Genre mismatch penalty | −15 | When intent has genres but item matches none |
| Decade match | +10 | When item falls within requested decade |
| Quality baseline | ~+10–15 | `vote_average × 1.5 + log(vote_count) × 2` |
| Quality mode (underrated) | up to +30 | Inverse popularity bonus |
| Quality mode (acclaimed) | variable | `vote_average × 3` |
| Mood keywords in overview | +4 | Soft nudge, not dominant |
| User taste (liked genres) | +2 per genre | From Keep history |
| User taste (passed genres) | −1 per genre | From Pass history |

---

## 🔧 Setup

### Prerequisites

- Node.js 18+
- A [TMDB API key](https://developer.themoviedb.org/docs/getting-started)
- A [Google AI Studio key](https://aistudio.google.com/apikey) (for Gemini — optional, falls back to regex parsing)
- An [Upstash Redis](https://upstash.com/) instance

### Environment Variables

Create `.env.local` in the project root:

```env
# TMDB (at least one required)
TMDB_READ_TOKEN=your_tmdb_v4_bearer_token
TMDB_API_KEY=your_tmdb_v3_api_key

# Upstash Redis (required for caching)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Gemini (optional — enables AI intent parsing + "Why X?" reasons)
GEMINI_API_KEY=your_gemini_api_key
```

### Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🎯 Example Queries

| Query | What happens |
|---|---|
| `dark sci-fi from the 90s` | Discover strategy with genre + decade + mood filtering |
| `shows like Breaking Bad` | TMDB recommendations for the show + keyword discover with drug/crime themes |
| `movies starring Tom Hanks` | Person credits strategy — pulls Tom Hanks' filmography |
| `what's trending` | Trending strategy — this week's most talked-about titles |
| `hidden gem horror` | Discover with underrated quality mode + horror genre + capped popularity |
| `anime` | Discover with animation genre + "anime" keyword + Japanese language filter |

---

## 📐 Design Principles

- **Ranking over generation** — AI parses intent; data decides candidates
- **Deterministic by default** — same input, same session, same day → same results
- **Cache everything** — Redis layer keeps TMDB and Gemini responses fast and cheap
- **Graceful degradation** — no Gemini key? Regex fallback. No keywords? Genre-only discover. No results? Popularity fallback.
- **No hallucinations** — every title in the deck exists in TMDB's database

---

## 🗺️ Roadmap

- [ ] Perfect the recommendation algorithm — scoring weights, thematic matching, edge-case handling
- [ ] Polish the UI/UX — mobile-first swipe experience, animations, visual design
- [ ] Cloud / Kubernetes deployment with persistent Redis
- [ ] CI/CD pipeline (build, lint, test, deploy)

---

## 📄 License

Private project. Not currently licensed for distribution.
