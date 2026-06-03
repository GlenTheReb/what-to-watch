# 🎬 What to Watch

**Live Demo:** [what-to-watch-ten-lemon.vercel.app](https://what-to-watch-ten-lemon.vercel.app/)

**Screenshots**
<img width="1598" height="979" alt="image" src="https://github.com/user-attachments/assets/bb8c56d7-3467-4c1c-b561-5fe84285f3f8" />

<img width="1613" height="985" alt="image" src="https://github.com/user-attachments/assets/10ae50c2-a258-4115-ac5a-c6594e238e22" />



> Stop scrolling. Start watching.

An AI-powered movie & TV recommendation engine that actually understands what you're in the mood for. Type a vibe, a reference, a genre, a decade — or just "something like Breaking Bad" — and get 10 curated picks ranked by real signal, not popularity noise.

Built on **Next.js**, **Gemini AI**, **TMDB**, and **Upstash Redis**.

---

## ✨ What Makes This Different

Most recommendation apps either reshuffle popular titles or let an LLM hallucinate a list.

**What to Watch** takes a hybrid approach:

1. **Gemini parses your intent** — natural language → structured query (genres, moods, themes, keywords, reference titles, people, genre strictness).
2. **TMDB provides the ground truth** — candidates are sourced from real data via targeted API strategies (discover, recommendations, person credits, trending, etc.).
3. **TMDB keyword tags validate relevance** — each candidate's structured keyword tags are fetched and matched against your intent for precise scoring.
4. **A deterministic scoring pipeline ranks everything** — TMDB tag matching, word-level overview matching, genre overlap, quality signals, decade alignment, user taste history.
5. **Gemini explains each pick** — every card gets a personalized "Why this?" reason generated from cast, crew, and plot context.

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
│                       │     TMDB keyword tag matching,
│  • Tag matching       │     word-level overview matching,
│  • Word-level match   │     genre overlap, source weighting,
│  • Genre overlap      │     mood nudges, user taste weights
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
| Frontend | Next.js 16 (App Router), React 19, TailwindCSS 4, Framer Motion, Lucide Icons |
| AI | Google Gemini 3.1 Flash Lite (`@google/generative-ai`) |
| Data | TMDB API v3 |
| Cache | Upstash Redis (`@upstash/redis`) |
| Language | TypeScript 5 |
| CI/CD | GitHub Actions, Playwright, Vercel Preview Deployments |

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
- `interpretPrompt()` — Parses natural language into a `ParsedIntent` struct (genres, mood, themes, keywords, reference titles, people, strategies, media type, quality, genreMode). Falls back to regex-based extraction if no API key is set.
- `generateWhyReasons()` — Takes the final 10 picks with their cast/crew data and generates personalized "Why this?" explanations in a single batch call.

**`tmdb.ts`** — Comprehensive TMDB wrapper covering:
- Movie & TV Discover (with keyword, genre, date range, and quality filters)
- Multi-search, keyword search, person search
- Title-based recommendations
- Person credits (filmography)
- Title credits (cast + director extraction for "Why X?" enrichment)
- Keyword tag fetching (structured metadata for scoring)
- Trending, popular, top-rated, and upcoming endpoints

**`route.ts`** — The `/api/deck` POST handler orchestrating the full pipeline:
1. Parse intent via Gemini (with genreMode for strict/loose genre filtering)
2. Route to TMDB strategies based on intent
3. Fetch all candidates in parallel
4. De-duplicate, filter (anime, media type, genre, seen IDs)
5. Fetch TMDB keyword tags for top 25 candidates
6. Score and rank deterministically (tag matching + word-level overview matching)
7. Shuffle a variety pool with seeded PRNG (score-gated to prevent junk)
8. Fetch credits for the final 10
9. Generate AI reasoning via Gemini
10. Return cards with fallback to template-based reasons

### 🔄 CI/CD & DevOps Pipeline

This project features a "Gold Standard" automated DevOps pipeline designed for safety and speed:

1. **Code Quality Checks (GitHub Actions)**
   - Every push and Pull Request automatically runs ESLint and TypeScript compilation checks to catch syntax and type errors before they are ever merged.
2. **Vercel Preview Deployments (CD)**
   - Opening a Pull Request instantly triggers Vercel to build and deploy a live "Preview" cloud environment of the app.
3. **End-to-End UI Testing (Playwright)**
   - A dedicated GitHub Action automatically pauses and waits for Vercel's Preview URL to be generated.
   - Once the live URL is ready, Playwright boots up headless browsers (Chromium, Firefox, WebKit) and runs End-to-End tests against the *live cloud environment*.
   - Tests utilize network interception to mock the TMDB/Gemini APIs, ensuring deterministic testing of the React UI and `localStorage` state management without burning API credits.
4. **Branch Protection**
   - The `main` branch is strictly protected. Code can only be merged via a Pull Request after both the Code Quality and E2E Testing checks pass.

---

## 📊 Scoring System

Each candidate is scored using a composite of signals:

| Signal | Points | Notes |
|---|---|---|
| TMDB keyword tag match | +18/+15/+12/+8 each | **Primary** relevance signal — structured metadata |
| Overview/title word match | +10/+8/+5/+3 each | Secondary signal — word-level matching against overview + title |
| Completeness bonus (75%+ match) | +20 | When a show matches most intent terms |
| TMDB recommendation source | +35–120 | Higher if thematically validated via word hits |
| Person credits source | +40 | Actor/director match |
| Genre overlap | +8 per match | Deduplicated for TV genre aliasing |
| Genre mismatch penalty | −10 | When intent has genres but item matches none |
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
- [x] Polish the UI/UX — mobile-first swipe experience, animations, visual design
- [x] Cloud deployment (Vercel) with persistent Redis (Upstash)
- [x] CI/CD pipeline via Vercel (build, lint, test, deploy)

---

## 📄 License

This project is licensed under the MIT License.
