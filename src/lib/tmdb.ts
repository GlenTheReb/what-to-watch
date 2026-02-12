import { getJson, setJson } from "./cache";

type TmdbListResponse<T> = {
  results: T[];
};

export type TmdbMovie = {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
};

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdbHeaders(): HeadersInit {
  const token = process.env.TMDB_READ_TOKEN;
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function tmdbAuthQuery(): string {
  const apiKey = process.env.TMDB_API_KEY;
  return apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
}

export async function fetchDiscoverMovies(page = 1): Promise<TmdbMovie[]> {
  const key = `tmdb:discover:movie:popularity_desc:votes200:p${page}:v1`;
  const cached = await getJson<TmdbMovie[]>(key);
  if (cached) {
    console.log(`[Cache HIT] ${key}`);
    return cached;
  }
  console.log(`[Cache MISS] ${key}`);

  const url =
    `${TMDB_BASE}/discover/movie?` +
    `include_adult=false&include_video=false&language=en-US` +
    `&sort_by=popularity.desc` +
    `&vote_count.gte=200` +
    `&page=${page}` +
    tmdbAuthQuery();

  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);

  const data = (await res.json()) as TmdbListResponse<TmdbMovie>;
  const results = data.results ?? [];
  await setJson(key, results, 6 * 60 * 60);
  console.log(`[Cache SET] ${key}`);
  return results;
}

export async function fetchTrendingMovies(): Promise<TmdbMovie[]> {
  const key = "tmdb:trending:movie:week:v1";
  const cached = await getJson<TmdbMovie[]>(key);
  if (cached) {
    console.log(`[Cache HIT] ${key}`);
    return cached;
  }
  console.log(`[Cache MISS] ${key}`);

  const url = `${TMDB_BASE}/trending/movie/week?language=en-US` + tmdbAuthQuery();
  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  const data = (await res.json()) as TmdbListResponse<TmdbMovie>;

  const results = data.results ?? [];
  await setJson(key, results, 2 * 60 * 60);
  console.log(`[Cache SET] ${key}`);
  return results;
}

export async function fetchTopRatedMovies(page = 1): Promise<TmdbMovie[]> {
  const key = `tmdb:top_rated:movie:p${page}:v1`;
  const cached = await getJson<TmdbMovie[]>(key);
  if (cached) {
    console.log(`[Cache HIT] ${key}`);
    return cached;
  }
  console.log(`[Cache MISS] ${key}`);

  const url =
    `${TMDB_BASE}/movie/top_rated?language=en-US&page=${page}` + tmdbAuthQuery();
  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  const data = (await res.json()) as TmdbListResponse<TmdbMovie>;

  const results = data.results ?? [];
  await setJson(key, results, 6 * 60 * 60);
  console.log(`[Cache SET] ${key}`);
  return results;
}


