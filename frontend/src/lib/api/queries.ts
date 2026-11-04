/**
 * TanStack Query option factories: one place that owns every query key and fetcher, shared by
 * client components (useQuery) and the live-event invalidation logic.
 */
import { queryOptions } from "@tanstack/react-query";

import { api, ApiError, getJSON, unwrap } from "./client";
import type {
  AssetListParams,
  AssetsGeoJSON,
  CultureListParams,
  RoutesGeoJSON,
  SearchParams,
  SitesGeoJSON,
} from "./types";

export const keys = {
  all: ["hl"] as const,
  authMe: () => [...keys.all, "auth", "me"] as const,
  stats: () => [...keys.all, "stats"] as const,
  sites: () => [...keys.all, "sites"] as const,
  sitesGeo: () => [...keys.all, "sites", "geojson"] as const,
  site: (slug: string) => [...keys.all, "sites", slug] as const,
  modelModes: (slug: string) => [...keys.all, "sites", slug, "model-modes"] as const,
  culture: () => [...keys.all, "culture"] as const,
  cultureList: (p: CultureListParams) => [...keys.all, "culture", "list", p] as const,
  journeys: () => [...keys.all, "journeys"] as const,
  routesGeo: () => [...keys.all, "journeys", "geojson"] as const,
  journey: (slug: string) => [...keys.all, "journeys", slug] as const,
  search: (p: SearchParams) => [...keys.all, "search", p] as const,
  assets: () => [...keys.all, "assets"] as const,
  assetList: (p: AssetListParams) => [...keys.all, "assets", "list", p] as const,
  assetsGeo: () => [...keys.all, "assets", "geojson"] as const,
  asset: (id: number) => [...keys.all, "assets", id] as const,
  chunks: (id: number) => [...keys.all, "assets", id, "chunks"] as const,
  jobs: () => [...keys.all, "jobs"] as const,
  workers: () => [...keys.all, "workers"] as const,
  twins: () => [...keys.all, "twins"] as const,
};

/** The signed-in account, or null when there is no valid session cookie. */
export const authMeQuery = () =>
  queryOptions({
    queryKey: keys.authMe(),
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/v1/auth/me"));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

export const statsQuery = () =>
  queryOptions({ queryKey: keys.stats(), queryFn: () => unwrap(api.GET("/api/v1/stats")), staleTime: 10_000 });

export const sitesQuery = () =>
  queryOptions({ queryKey: keys.sites(), queryFn: () => unwrap(api.GET("/api/v1/sites")), staleTime: 60_000 });

export const sitesGeoQuery = () =>
  queryOptions({
    queryKey: keys.sitesGeo(),
    queryFn: () => getJSON<SitesGeoJSON>("/api/v1/sites/geojson"),
    staleTime: 60_000,
  });

export const siteQuery = (slug: string) =>
  queryOptions({
    queryKey: keys.site(slug),
    queryFn: () => unwrap(api.GET("/api/v1/sites/{slug}", { params: { path: { slug } } })),
  });

export const modelModesQuery = (slug: string) =>
  queryOptions({
    queryKey: keys.modelModes(slug),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/sites/{slug}/model-modes", { params: { path: { slug } }, signal })),
    staleTime: 15_000,
  });

export const cultureListQuery = (params: CultureListParams) =>
  queryOptions({
    queryKey: keys.cultureList(params),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/culture", { params: { query: params }, signal })),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });

export const journeysQuery = () =>
  queryOptions({ queryKey: keys.journeys(), queryFn: () => unwrap(api.GET("/api/v1/journeys")), staleTime: 60_000 });

export const journeyQuery = (slug: string) =>
  queryOptions({
    queryKey: keys.journey(slug),
    queryFn: () => unwrap(api.GET("/api/v1/journeys/{slug}", { params: { path: { slug } } })),
    staleTime: 60_000,
  });

export const routesGeoQuery = () =>
  queryOptions({
    queryKey: keys.routesGeo(),
    queryFn: () => getJSON<RoutesGeoJSON>("/api/v1/journeys/geojson"),
    staleTime: 60_000,
  });

export const searchQuery = (params: SearchParams) =>
  queryOptions({
    queryKey: keys.search(params),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/search", { params: { query: params }, signal })),
    enabled: params.q.trim().length > 0,
    staleTime: 30_000,
  });

export const assetListQuery = (params: AssetListParams) =>
  queryOptions({
    queryKey: keys.assetList(params),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/assets", { params: { query: params }, signal })),
    placeholderData: (previous) => previous,
  });

export const assetsGeoQuery = () =>
  queryOptions({
    queryKey: keys.assetsGeo(),
    queryFn: () => getJSON<AssetsGeoJSON>("/api/v1/assets/geojson"),
    staleTime: 30_000,
  });

export const assetQuery = (id: number) =>
  queryOptions({
    queryKey: keys.asset(id),
    queryFn: () => unwrap(api.GET("/api/v1/assets/{asset_id}", { params: { path: { asset_id: id } } })),
  });

export const chunksQuery = (id: number) =>
  queryOptions({
    queryKey: keys.chunks(id),
    queryFn: () => unwrap(api.GET("/api/v1/assets/{asset_id}/chunks", { params: { path: { asset_id: id } } })),
  });
