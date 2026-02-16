# What to Watch

A deterministic, cache-aware movie recommendation engine built on top of TMDB.

This project explores how far structured data, ranking logic, and lightweight preference modelling can go before relying on large language models.

---

## Why This Exists

Most “AI recommendation” demos either:
- Wrap an API and reshuffle popular titles, or  
- Delegate everything to an LLM.

This project takes a different approach.

It treats recommendation as a **ranking and systems problem**, not a generation problem.

User input is translated into structured signals. A curated candidate pool is built from TMDB Discover slices. Movies are scored deterministically using:

- Quality signals (vote average + vote count)
- Genre intent matching
- Free-text topic matching against overviews
- Popularity bias controls (e.g. underrated mode)
- Personalised genre weights derived from Keep/Pass history

No generative AI is required for core functionality.

---

## Core Features

- Free-text prompt input
- Curated candidate pool using TMDB Discover (not trending/top lists)
- Deterministic seeded shuffling (session + day + reroll)
- Local preference learning (genre-weighted boosting)
- No repeats across swipes
- Stateless design (no accounts, no database)

---

## Architecture

### Frontend
- Next.js (App Router)
- TypeScript
- TailwindCSS
- React state + LocalStorage preference tracking

### Backend
- Next.js Route Handler (`/api/deck`)
- TMDB API
- Custom ranking pipeline
- Deterministic seeded PRNG
- Cache layer (Redis-ready)

### Candidate Strategy

Instead of relying on trending or top-rated lists, the system builds pools from:

- Multiple year slices
- Rating thresholds
- Vote count thresholds
- Optional genre constraints

This reduces mainstream bias and improves variety.

---

## Ranking Pipeline

1. Build candidate pool from Discover slices
2. Remove seen IDs (likes + passes)
3. Apply hard genre filtering when intent is clear
4. Score each movie using:
   - Quality baseline
   - Intent matching
   - Topic token hits
   - Underrated / bad-movie modifiers
   - Personal genre weight boosts
5. Deterministically shuffle top bucket for variety
6. Return 10 cards

The system is fully deterministic for a given session, day, and reroll index.

---

## Learning Model

Keep and Pass actions are not just stored.

They are converted into genre weight maps:

- Genres frequently kept receive a positive score multiplier.
- Genres frequently passed receive a negative adjustment.

This gradually reshapes the ranking space without needing persistent storage.

---

## Environment Variables

Create `.env.local`:

```
TMDB_READ_TOKEN=your_tmdb_bearer_token
# or
TMDB_API_KEY=your_tmdb_api_key
```

---

## Local Development

```
npm install
npm run dev
```

Runs at:

```
http://localhost:3000
```

---

## Design Principles

- Deterministic over generative
- Ranking logic over randomness
- Cache-friendly architecture
- Minimal API surface
- AI as translator, not database

---

## Roadmap

- Semantic expansion layer (LLM translator with caching)
- Overview embeddings for vector similarity
- Actor/director preference modelling
- Kubernetes deployment with Redis backing

---

## Status

Active development.
Core ranking, filtering, and local preference shaping implemented.
