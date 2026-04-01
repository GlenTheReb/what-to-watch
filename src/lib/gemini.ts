import { GoogleGenerativeAI } from "@google/generative-ai";
import { getJson, setJson } from "./cache";

export type ParsedIntent = {
  genres: string[];
  decades: string[];
  mood: string;
  themes: string[];
  keywords: string[];
  referenceTitles: string[];
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
  mediaType: "any",
  quality: "any",
  description: "General recommendations",
};

const SYSTEM_PROMPT = `You are a movie/TV recommendation intent parser. Extract structured info from the user's query about what they want to watch.

Return JSON with exactly these fields:
{
  "genres": string[] - from ONLY: "action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "family", "fantasy", "history", "horror", "music", "mystery", "romance", "science_fiction", "thriller", "war", "western". Pick all that apply.
  "decades": string[] - e.g. ["1990s", "2020s"]. Empty if not specified.
  "mood": string - one of: "lighthearted", "dark", "intense", "cerebral", "emotional", "adventurous", "relaxing", "nostalgic", "any".
  "themes": string[] - broad thematic tags like "time travel", "heist", "zombie". Empty if none.
  "keywords": string[] - TMDB-style keyword tags describing specific plot elements, settings, or character types. Think about what makes content similar. Generate 3-8 specific keywords. Examples: "drug trade", "organized crime", "double life", "anti-hero", "moral decay", "high school", "serial killer", "space exploration".
  "referenceTitles": string[] - If the user mentions specific movies/shows by name (e.g. "like Breaking Bad", "similar to Inception", "Narcos type"), extract the EXACT title names here. Empty if none mentioned.
  "mediaType": string - "movie", "tv", or "any". Default "any".
  "quality": string - "acclaimed", "underrated", "bad" (so-bad-it's-good), or "any". Default "any".
  "description": string - brief 1-line summary of what the user wants.
}

Examples:
- "funny movies from the 90s" → {"genres":["comedy"],"decades":["1990s"],"mood":"lighthearted","themes":[],"keywords":["slapstick","buddy comedy","parody"],"referenceTitles":[],"mediaType":"movie","quality":"any","description":"90s comedies"}
- "shows like breaking bad" → {"genres":["crime","drama","thriller"],"decades":[],"mood":"intense","themes":["drugs","crime"],"keywords":["drug trade","meth","double life","anti-hero","moral decay","crime boss","family secret"],"referenceTitles":["Breaking Bad"],"mediaType":"tv","quality":"acclaimed","description":"Intense crime dramas like Breaking Bad"}
- "underrated sci-fi" → {"genres":["science_fiction"],"decades":[],"mood":"any","themes":[],"keywords":["dystopia","alien","space","artificial intelligence","time travel"],"referenceTitles":[],"mediaType":"any","quality":"underrated","description":"Hidden gem sci-fi"}
- "movies like inception" → {"genres":["science_fiction","thriller","action"],"decades":[],"mood":"cerebral","themes":["dreams","reality"],"keywords":["dream","subconscious","heist","mind-bending","layered reality"],"referenceTitles":["Inception"],"mediaType":"movie","quality":"acclaimed","description":"Mind-bending thrillers like Inception"}

Be generous with keyword generation — keywords are the PRIMARY way we find similar content.`;

function fallbackInterpret(query: string): ParsedIntent {
  const t = query.toLowerCase();
  const intent: ParsedIntent = {
    ...DEFAULT_INTENT,
    genres: [],
    decades: [],
    themes: [],
    keywords: [],
    referenceTitles: [],
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

  // Extract reference titles from "like X" or "similar to X" patterns
  const likeMatch = t.match(/(?:like|similar to|type of)\s+(.+?)(?:\s*$|,)/);
  if (likeMatch) intent.referenceTitles.push(likeMatch[1].trim());

  return intent;
}

export async function interpretPrompt(query: string): Promise<ParsedIntent> {
  if (!query.trim()) return { ...DEFAULT_INTENT };

  const normalised = query.trim().toLowerCase().slice(0, 200);
  const cacheKey = `gemini:intent:${normalised}:v3`;

  const cached = await getJson<ParsedIntent>(cacheKey);
  if (cached) {
    console.log(`[Gemini Cache HIT] ${cacheKey}`);
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
      model: "gemini-2.0-flash",
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
      mood: typeof raw.mood === "string" ? raw.mood : "any",
      themes: safeStrArr(raw.themes),
      keywords: safeStrArr(raw.keywords),
      referenceTitles: safeStrArr(raw.referenceTitles),
      mediaType: ["movie", "tv", "any"].includes(raw.mediaType) ? raw.mediaType : "any",
      quality: ["acclaimed", "underrated", "any", "bad"].includes(raw.quality) ? raw.quality : "any",
      description: typeof raw.description === "string" ? raw.description : query,
    };

    await setJson(cacheKey, intent, 3600);
    console.log(`[Gemini] Parsed intent:`, JSON.stringify(intent));
    return intent;
  } catch (err) {
    console.error("[Gemini] Error, falling back to keywords:", err);
    return fallbackInterpret(query);
  }
}
