import { GoogleGenerativeAI } from "@google/generative-ai";
import { getJson, setJson } from "./cache";

export type ParsedIntent = {
  genres: string[];
  decades: string[];
  yearGte?: number;
  yearLte?: number;
  mood: string;
  themes: string[];
  keywords: string[];
  referenceTitles: string[];
  people: string[];
  strategies: string[];
  mediaType: "movie" | "tv" | "any";
  quality: "acclaimed" | "underrated" | "any" | "bad";
  description: string;
};

const DEFAULT_INTENT: ParsedIntent = {
  genres: [],
  decades: [],
  mood: "any",
  themes: [],
  keywords: [],
  referenceTitles: [],
  people: [],
  strategies: ["discover"],
  mediaType: "any",
  quality: "any",
  description: "General recommendations",
};

const SYSTEM_PROMPT = `You are a movie/TV recommendation intent parser and pipeline router. Extract structured info from the user's query about what they want to watch.

Return JSON with exactly these fields:
{
  "genres": string[] - from ONLY: "action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "family", "fantasy", "history", "horror", "music", "mystery", "romance", "science_fiction", "thriller", "war", "western". Pick all that apply. IMPORTANT: If the user asks for anime, cartoons, or animated content, you MUST include "animation" here. If they ask for docs, include "documentary".
  "decades": string[] - e.g. ["1990s", "2020s"]. Empty if not specified.
  "yearGte": number - Greater than or equal to year (e.g. for "after 2015" output 2016). Omit if not specified.
  "yearLte": number - Less than or equal to year (e.g. for "before 2000" output 1999). Omit if not specified.
  "mood": string - one of: "lighthearted", "dark", "intense", "cerebral", "emotional", "adventurous", "relaxing", "nostalgic", "any".
  "themes": string[] - broad thematic tags like "time travel", "heist", "zombie". Empty if none.
  "keywords": string[] - TMDB-style keyword tags. These MUST be concrete, searchable plot elements that would appear on a movie's TMDB page. Think: what specific settings, occupations, substances, activities, or plot devices define this content? Generate 5-10 keywords. AVOID vague words like "consequences", "power struggle", "transformation", "double life". PREFER concrete words like "methamphetamine", "drug cartel", "chemistry teacher", "desert", "money laundering", "DEA", "cancer diagnosis".
  "referenceTitles": string[] - If the user mentions specific movies/shows by name (e.g. "like Breaking Bad"), extract the EXACT title names here.
  "people": string[] - If the user mentions specific actors or directors (e.g. "starring Tom Hanks", "directed by Nolan"), extract their names here. Empty if none.
  "strategies": string[] - VERY IMPORTANT. Select one or more routing strategies based on the query. Options:
    - "trending": If user asks for "popular right now", "trending", "what everyone is watching".
    - "popular": If user asks for "popular", "most popular" (but not necessarily trending right now).
    - "top_rated": If user asks for "best of all time", "highest rated".
    - "upcoming": If user asks for "in theaters", "coming soon", "new releases".
    - "person_credits": If the user mentions specific actors or directors (must also populate "people" array).
    - "recommendations": If user says "like [Movie/Show]" or "similar to [Title]".
    - "discover": The default strategy for anything else (genres, moods, themes, decades). Use this if none of the above perfectly match.
  "mediaType": string - "movie", "tv", or "any". Default "any". IMPORTANT: Only set this to "movie" or "tv" if the user EXPLICITLY says "movies", "films", "shows", "series", or "TV". If they just say "something like [Title]" or "like [Title]" without specifying, keep it "any" — great recommendations can cross the movie/TV boundary.
  "quality": string - "acclaimed", "underrated", "bad" (so-bad-it's-good), or "any". Default "any".
  "description": string - brief 1-line summary of what the user wants.
}

Examples:
- "funny movies from the 90s" → {"genres":["comedy"],"decades":["1990s"],"mood":"lighthearted","themes":[],"keywords":["slapstick","buddy comedy","parody"],"referenceTitles":[],"people":[],"strategies":["discover"],"mediaType":"movie","quality":"any","description":"90s comedies"}
- "movies starring tom hanks after 2010" → {"genres":[],"decades":[],"yearGte":2011,"mood":"any","themes":[],"keywords":[],"referenceTitles":[],"people":["Tom Hanks"],"strategies":["person_credits"],"mediaType":"movie","quality":"any","description":"Movies starring Tom Hanks released after 2010"}
- "what is trending right now" → {"genres":[],"decades":[],"mood":"any","themes":[],"keywords":[],"referenceTitles":[],"people":[],"strategies":["trending"],"mediaType":"any","quality":"any","description":"Trending movies and TV"}
- "something like breaking bad" → {"genres":["crime","drama","thriller"],"decades":[],"mood":"intense","themes":["drugs","crime","moral decay"],"keywords":["drug dealer","methamphetamine","drug cartel","money laundering","organized crime","drug trafficking","drug lord","cocaine"],"referenceTitles":["Breaking Bad"],"people":[],"strategies":["recommendations"],"mediaType":"any","quality":"acclaimed","description":"Intense crime dramas like Breaking Bad"}
- "movies like breaking bad" → {"genres":["crime","drama","thriller"],"decades":[],"mood":"intense","themes":["drugs","crime","moral decay"],"keywords":["drug dealer","methamphetamine","drug cartel","money laundering","organized crime","drug trafficking","drug lord","cocaine"],"referenceTitles":["Breaking Bad"],"people":[],"strategies":["recommendations"],"mediaType":"movie","quality":"acclaimed","description":"Intense crime movies like Breaking Bad"}
- "shows like breaking bad" → {"genres":["crime","drama","thriller"],"decades":[],"mood":"intense","themes":["drugs","crime","moral decay"],"keywords":["drug dealer","methamphetamine","drug cartel","money laundering","organized crime","drug trafficking"],"referenceTitles":["Breaking Bad"],"people":[],"strategies":["recommendations"],"mediaType":"tv","quality":"acclaimed","description":"Intense crime dramas like Breaking Bad"}

IMPORTANT: Keywords are used to search the TMDB keyword database. Use concrete nouns and specific plot elements that would actually be tagged on movie/TV pages. For "like X" queries, think about what SPECIFIC elements make that show unique and what other content shares those elements.`;

function fallbackInterpret(query: string): ParsedIntent {
  const t = query.toLowerCase();
  const intent: ParsedIntent = {
    ...DEFAULT_INTENT,
    genres: [],
    decades: [],
    themes: [],
    keywords: [],
    referenceTitles: [],
    people: [],
    strategies: [],
    description: query || "General picks",
  };

  if (/comedy|funny|humor|humour|laugh|satire/.test(t)) intent.genres.push("comedy");
  if (/horror|scary|slasher|ghost|demon|haunting/.test(t)) intent.genres.push("horror");
  if (/mystery|detective|whodunit|investigation/.test(t)) intent.genres.push("mystery");
  if (/action|explosive|fight|martial/.test(t)) intent.genres.push("action");
  if (/romance|romantic|love story/.test(t)) intent.genres.push("romance");
  if (/thriller|suspense|tense/.test(t)) intent.genres.push("thriller");
  if (/sci-fi|science fiction|space|alien/.test(t)) intent.genres.push("science_fiction");
  if (/anime|shonen|isekai|animation|animated/.test(t)) intent.genres.push("animation");
  if (/drama|dramatic|emotional/.test(t)) intent.genres.push("drama");
  if (/documentary|docu/.test(t)) intent.genres.push("documentary");
  if (/western|cowboy/.test(t)) intent.genres.push("western");
  if (/war|military|soldier/.test(t)) intent.genres.push("war");
  if (/fantasy|magical|dragon/.test(t)) intent.genres.push("fantasy");
  if (/crime|mafia|gangster|heist/.test(t)) intent.genres.push("crime");

  if (/underrated|hidden gem|under the radar/.test(t)) intent.quality = "underrated";
  if (/bad movie|so bad|trash|guilty pleasure/.test(t)) intent.quality = "bad";
  if (/\btv\b|show|series|season/.test(t)) intent.mediaType = "tv";
  else if (/\bmovie|film|cinema/.test(t)) intent.mediaType = "movie";
  if (/dark|grim|bleak/.test(t)) intent.mood = "dark";
  if (/fun|lighthearted|feel.?good|cheerful/.test(t)) intent.mood = "lighthearted";
  if (/intense|gripping|edge/.test(t)) intent.mood = "intense";
  if (/cerebral|thought.?provoking|mind.?bend/.test(t)) intent.mood = "cerebral";

  const decadeMatch = t.match(/(\d{4})s/);
  if (decadeMatch) {
    const d = parseInt(decadeMatch[1]);
    if (d >= 1920 && d <= 2020) intent.decades.push(`${d}s`);
  }

  const afterMatch = t.match(/after (\d{4})/);
  if (afterMatch) intent.yearGte = parseInt(afterMatch[1]) + 1;
  const beforeMatch = t.match(/before (\d{4})/);
  if (beforeMatch) intent.yearLte = parseInt(beforeMatch[1]) - 1;

  // Extract reference titles from "like X" or "similar to X" patterns
  const likeMatch = t.match(/(?:like|similar to|type of)\s+(.+?)(?:\s*$|,)/);
  if (likeMatch) intent.referenceTitles.push(likeMatch[1].trim());

  if (/trending|popular right now|everyone is watching/.test(t)) intent.strategies.push("trending");
  if (/popular/.test(t) && !intent.strategies.includes("trending")) intent.strategies.push("popular");
  if (/top rated|best of all time/.test(t)) intent.strategies.push("top_rated");
  if (/upcoming|in theaters|new release/.test(t)) intent.strategies.push("upcoming");
  if (intent.referenceTitles.length > 0) intent.strategies.push("recommendations");

  if (intent.strategies.length === 0) intent.strategies.push("discover");

  return intent;
}

export async function interpretPrompt(query: string): Promise<ParsedIntent> {
  if (!query.trim()) return { ...DEFAULT_INTENT };

  const normalised = query.trim().toLowerCase().slice(0, 200);
  const cacheKey = `gemini:intent:${normalised}:v7`;

  const cached = await getJson<ParsedIntent>(cacheKey);
  if (cached) {
    console.log(`[Gemini Cache HIT] ${cacheKey}`);
    if (/\banime|shonen|isekai\b/i.test(query) && !cached.keywords.includes("anime")) {
      cached.keywords.unshift("anime");
    }
    return cached;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] No API key found, using keyword fallback");
    return fallbackInterpret(query);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(query);
    const text = result.response.text();
    const raw = JSON.parse(text);

    const safeStrArr = (val: unknown) =>
      Array.isArray(val) ? val.filter((x: unknown) => typeof x === "string") : [];

    const intent: ParsedIntent = {
      genres: safeStrArr(raw.genres),
      decades: safeStrArr(raw.decades),
      yearGte: typeof raw.yearGte === "number" ? raw.yearGte : undefined,
      yearLte: typeof raw.yearLte === "number" ? raw.yearLte : undefined,
      mood: typeof raw.mood === "string" ? raw.mood : "any",
      themes: safeStrArr(raw.themes),
      keywords: safeStrArr(raw.keywords),
      referenceTitles: safeStrArr(raw.referenceTitles),
      people: safeStrArr(raw.people),
      strategies: safeStrArr(raw.strategies),
      mediaType: ["movie", "tv", "any"].includes(raw.mediaType) ? raw.mediaType : "any",
      quality: ["acclaimed", "underrated", "any", "bad"].includes(raw.quality) ? raw.quality : "any",
      description: typeof raw.description === "string" ? raw.description : query,
    };

    // Hard override: Force the "anime" keyword so TMDB filters out western cartoons
    if (/\banime|shonen|isekai\b/i.test(query) && !intent.keywords.includes("anime")) {
      intent.keywords.unshift("anime");
    }

    if (intent.strategies.length === 0) intent.strategies.push("discover");

    await setJson(cacheKey, intent, 3600);
    console.log(`[Gemini] Parsed intent:`, JSON.stringify(intent));
    return intent;
  } catch (err) {
    console.error("[Gemini] Error, falling back to keywords:", err);
    return fallbackInterpret(query);
  }
}

/* ─── "Why X?" reason generation ─── */

type WhyItem = {
  title: string;
  year: number;
  overview: string;
  mediaType: "movie" | "tv";
  source: string;
  cast: string[];
  director: string | null;
};

export async function generateWhyReasons(
  userQuery: string,
  intent: ParsedIntent,
  items: WhyItem[],
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || items.length === 0) return items.map(() => "");

  // Build rich intent context
  const intentContext = [
    `Genres: ${intent.genres.join(", ") || "none"}`,
    `Mood: ${intent.mood}`,
    `Themes: ${intent.themes.join(", ") || "none"}`,
    `Keywords: ${intent.keywords.join(", ") || "none"}`,
    intent.referenceTitles.length > 0 ? `Reference titles: ${intent.referenceTitles.join(", ")}` : null,
    intent.people.length > 0 ? `People: ${intent.people.join(", ")}` : null,
    intent.decades.length > 0 ? `Decades: ${intent.decades.join(", ")}` : null,
    `Quality: ${intent.quality}`,
  ].filter(Boolean).join("\n");

  // Build per-title listing with cast/crew
  const listing = items
    .map((item, i) => {
      const parts = [
        `${i + 1}. "${item.title}" (${item.year}, ${item.mediaType})`,
        `   Source: ${item.source}`,
        `   Overview: ${item.overview.slice(0, 300)}`,
      ];
      if (item.cast.length > 0) parts.push(`   Cast: ${item.cast.join(", ")}`);
      if (item.director) parts.push(`   Director: ${item.director}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const prompt = `You are a movie/TV recommendation assistant. The user asked: "${userQuery}"

Interpreted as: ${intent.description}

User's intent breakdown:
${intentContext}

For each recommended title below, write a short, compelling reason explaining WHY this specific title is a great match for what the user is looking for.

Rules:
- Be specific: reference plot elements, themes, tone, cast, director, or connections to the user's request.
- If there's a shared actor or director with a reference title the user mentioned, call that out.
- If the source says "recommendation" and there are reference titles, explain the connection.
- If the source says "person_credits", mention the specific actor/director by name.
- Use the overview and cast data to make each reason unique and specific — avoid generic descriptions.
- Keep each reason between 8 and 20 words. One sentence only.
- Don't start with the title name. Don't use generic filler like "A great pick" or "You'll love this".
- Write in a casual, confident tone — like a friend recommending something.

Titles:
${listing}

Return a JSON array of exactly ${items.length} strings, one per title, in the same order.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed) && parsed.length === items.length) {
      console.log(`[Gemini] Generated ${parsed.length} "Why?" reasons`);
      return parsed.map((r: unknown) => (typeof r === "string" ? r : ""));
    }

    console.warn("[Gemini] Why reasons: unexpected shape, falling back");
    return items.map(() => "");
  } catch (err) {
    console.error("[Gemini] Why reasons error:", err);
    return items.map(() => "");
  }
}

