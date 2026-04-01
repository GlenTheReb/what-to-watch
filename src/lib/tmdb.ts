import { getJson, setJson } from "./cache";

type TmdbListResponse<T> = { results: T[] };

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

export type TmdbTV = {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
};

export type TmdbMultiResult = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  vote_average?: number;
  poster_path?: string | null;
};

/* ─── Genre maps ─── */

export const MOVIE_GENRE_MAP: Record<string, number> = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749,
  science_fiction: 878, thriller: 53, war: 10752, western: 37,
};

export const TV_GENRE_MAP: Record<string, number> = {
  action: 10759, adventure: 10759, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 10765,
  horror: 9648, mystery: 9648, romance: 18, science_fiction: 10765,
  thriller: 80, war: 10768, western: 37,
};

/* ─── Internals ─── */

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

/* ─── Movie Discover ─── */

export async function fetchDiscoverCustom(params: {
  page: number;
  sort_by: string;
  vote_count_gte?: number;
  vote_average_gte?: number;
  with_genres?: string;
  with_keywords?: string;
  primary_release_date_gte?: string;
  primary_release_date_lte?: string;
}): Promise<TmdbMovie[]> {
  const { page, sort_by, vote_count_gte, vote_average_gte, with_genres,
    with_keywords, primary_release_date_gte, primary_release_date_lte } = params;

  const key = `tmdb:discover:custom:sort=${sort_by}:votesGte=${vote_count_gte ?? "na"}` +
    `:avgGte=${vote_average_gte ?? "na"}:genres=${with_genres ?? "na"}` +
    `:kw=${with_keywords ?? "na"}:prdGte=${primary_release_date_gte ?? "na"}` +
    `:prdLte=${primary_release_date_lte ?? "na"}:p${page}:v2`;

  const cached = await getJson<TmdbMovie[]>(key);
  if (cached) { console.log(`[Cache HIT] ${key}`); return cached; }
  console.log(`[Cache MISS] ${key}`);

  const qs: string[] = ["include_adult=false", "include_video=false", "language=en-US",
    `sort_by=${encodeURIComponent(sort_by)}`, `page=${page}`];
  if (typeof vote_count_gte === "number") qs.push(`vote_count.gte=${vote_count_gte}`);
  if (typeof vote_average_gte === "number") qs.push(`vote_average.gte=${vote_average_gte}`);
  if (with_genres) qs.push(`with_genres=${encodeURIComponent(with_genres)}`);
  if (with_keywords) qs.push(`with_keywords=${encodeURIComponent(with_keywords)}`);
  if (primary_release_date_gte) qs.push(`primary_release_date.gte=${primary_release_date_gte}`);
  if (primary_release_date_lte) qs.push(`primary_release_date.lte=${primary_release_date_lte}`);

  const res = await fetch(`${TMDB_BASE}/discover/movie?${qs.join("&")}` + tmdbAuthQuery(),
    { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  const data = (await res.json()) as TmdbListResponse<TmdbMovie>;
  const results = data.results ?? [];
  await setJson(key, results, 12 * 60 * 60);
  return results;
}

/* ─── TV Discover ─── */

export async function fetchDiscoverTVCustom(params: {
  page: number;
  sort_by: string;
  vote_count_gte?: number;
  vote_average_gte?: number;
  with_genres?: string;
  with_keywords?: string;
  first_air_date_gte?: string;
  first_air_date_lte?: string;
}): Promise<TmdbTV[]> {
  const { page, sort_by, vote_count_gte, vote_average_gte, with_genres,
    with_keywords, first_air_date_gte, first_air_date_lte } = params;

  const key = `tmdb:discover:tv:custom:sort=${sort_by}:votesGte=${vote_count_gte ?? "na"}` +
    `:avgGte=${vote_average_gte ?? "na"}:genres=${with_genres ?? "na"}` +
    `:kw=${with_keywords ?? "na"}:fadGte=${first_air_date_gte ?? "na"}` +
    `:fadLte=${first_air_date_lte ?? "na"}:p${page}:v2`;

  const cached = await getJson<TmdbTV[]>(key);
  if (cached) { console.log(`[Cache HIT] ${key}`); return cached; }
  console.log(`[Cache MISS] ${key}`);

  const qs: string[] = ["include_adult=false", "language=en-US",
    `sort_by=${encodeURIComponent(sort_by)}`, `page=${page}`];
  if (typeof vote_count_gte === "number") qs.push(`vote_count.gte=${vote_count_gte}`);
  if (typeof vote_average_gte === "number") qs.push(`vote_average.gte=${vote_average_gte}`);
  if (with_genres) qs.push(`with_genres=${encodeURIComponent(with_genres)}`);
  if (with_keywords) qs.push(`with_keywords=${encodeURIComponent(with_keywords)}`);
  if (first_air_date_gte) qs.push(`first_air_date.gte=${first_air_date_gte}`);
  if (first_air_date_lte) qs.push(`first_air_date.lte=${first_air_date_lte}`);

  const res = await fetch(`${TMDB_BASE}/discover/tv?${qs.join("&")}` + tmdbAuthQuery(),
    { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  const data = (await res.json()) as TmdbListResponse<TmdbTV>;
  const results = data.results ?? [];
  await setJson(key, results, 12 * 60 * 60);
  return results;
}

/* ─── Search ─── */

export async function searchMulti(query: string): Promise<TmdbMultiResult[]> {
  const key = `tmdb:search:multi:${query.toLowerCase().slice(0, 100)}:v1`;
  const cached = await getJson<TmdbMultiResult[]>(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&language=en-US&include_adult=false` + tmdbAuthQuery();
  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as TmdbListResponse<TmdbMultiResult>;
  const results = (data.results ?? []).filter(r => r.media_type !== "person");
  await setJson(key, results, 12 * 60 * 60);
  return results;
}

export async function searchKeywords(query: string): Promise<{ id: number; name: string }[]> {
  const key = `tmdb:search:keyword:${query.toLowerCase().slice(0, 80)}:v1`;
  const cached = await getJson<{ id: number; name: string }[]>(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/search/keyword?query=${encodeURIComponent(query)}` + tmdbAuthQuery();
  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as TmdbListResponse<{ id: number; name: string }>;
  const results = data.results ?? [];
  await setJson(key, results, 24 * 60 * 60);
  return results;
}

/* ─── Recommendations ─── */

export async function fetchMovieRecommendations(movieId: number): Promise<TmdbMovie[]> {
  const key = `tmdb:recs:movie:${movieId}:v1`;
  const cached = await getJson<TmdbMovie[]>(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/movie/${movieId}/recommendations?language=en-US&page=1` + tmdbAuthQuery();
  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as TmdbListResponse<TmdbMovie>;
  const results = data.results ?? [];
  await setJson(key, results, 24 * 60 * 60);
  return results;
}

export async function fetchTVRecommendations(tvId: number): Promise<TmdbTV[]> {
  const key = `tmdb:recs:tv:${tvId}:v1`;
  const cached = await getJson<TmdbTV[]>(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/tv/${tvId}/recommendations?language=en-US&page=1` + tmdbAuthQuery();
  const res = await fetch(url, { headers: tmdbHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as TmdbListResponse<TmdbTV>;
  const results = data.results ?? [];
  await setJson(key, results, 24 * 60 * 60);
  return results;
}
