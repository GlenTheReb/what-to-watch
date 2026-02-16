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

export async function fetchDiscoverCustom(params: {
  page: number;
  sort_by: string;
  vote_count_gte?: number;
  vote_average_gte?: number;
  with_genres?: string; // comma-separated TMDB genre ids
  primary_release_date_gte?: string; // YYYY-MM-DD
  primary_release_date_lte?: string; // YYYY-MM-DD
}): Promise<TmdbMovie[]> {
  const {
    page,
    sort_by,
    vote_count_gte,
    vote_average_gte,
    with_genres,
    primary_release_date_gte,
    primary_release_date_lte,
  } = params;

  const key =
    `tmdb:discover:custom:` +
    `sort=${sort_by}` +
    `:votesGte=${vote_count_gte ?? "na"}` +
    `:avgGte=${vote_average_gte ?? "na"}` +
    `:genres=${with_genres ?? "na"}` +
    `:prdGte=${primary_release_date_gte ?? "na"}` +
    `:prdLte=${primary_release_date_lte ?? "na"}` +
    `:p${page}:v1`;

  const cached = await getJson<TmdbMovie[]>(key);
  if (cached) {
    console.log(`[Cache HIT] ${key}`);
    return cached;
  }
  console.log(`[Cache MISS] ${key}`);

  const qs: string[] = [];
  qs.push("include_adult=false");
  qs.push("include_video=false");
  qs.push("language=en-US");
  qs.push(`sort_by=${encodeURIComponent(sort_by)}`);
  qs.push(`page=${page}`);

  if (typeof vote_count_gte === "number") qs.push(`vote_count.gte=${vote_count_gte}`);
  if (typeof vote_average_gte === "number") qs.push(`vote_average.gte=${vote_average_gte}`);
  if (with_genres) qs.push(`with_genres=${encodeURIComponent(with_genres)}`);
  if (primary_release_date_gte) qs.push(`primary_release_date.gte=${primary_release_date_gte}`);
  if (primary_release_date_lte) qs.push(`primary_release_date.lte=${primary_release_date_lte}`);

  const url = `${TMDB_BASE}/discover/movie?${qs.join("&")}` + tmdbAuthQuery();

  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);

  const data = (await res.json()) as TmdbListResponse<TmdbMovie>;
  const results = data.results ?? [];
  await setJson(key, results, 12 * 60 * 60); // 12h cache
  console.log(`[Cache SET] ${key}`);
  return results;
}



