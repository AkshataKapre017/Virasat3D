"use client";

import { useQuery } from "@tanstack/react-query";
import { Box, ChevronDown, Images, Landmark, Route, ScrollText, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AtlasMap, type MapFocus } from "@/components/map";
import { Badge, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Thumb } from "@/components/ui/thumb";
import { assetsGeoQuery, journeyQuery, journeysQuery, routesGeoQuery, siteQuery, sitesGeoQuery, sitesQuery } from "@/lib/api/queries";
import type { AssetFeatureProps, JourneyOut, SiteDetail, SiteOut, SitesGeoJSON } from "@/lib/api/types";
import {
  buildSiteTimeline,
  type DayPlan,
  FOLKLORE_COLOR,
  isFolkloreSite,
  NEARBY_RADIUS_KM,
  type NearbyPlace,
  placesNearRoute,
  placesWithin,
  type Place,
  planDay,
  relatedSites,
  sitePlace,
} from "@/lib/atlas";
import { categoryColor, formatEra, kindLabel, titleCase } from "@/lib/format";

export function AtlasExplorer() {
  const sitesGeo = useQuery(sitesGeoQuery());
  const assetsGeo = useQuery(assetsGeoQuery());
  const routesGeo = useQuery(routesGeoQuery());
  const journeys = useQuery(journeysQuery());
  const sites = useQuery(sitesQuery());

  const [layers, setLayers] = useState({ routes: true, folklore: false, architecture: true, archive: false });
  const [category, setCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetFeatureProps | null>(null);
  const [highlightRoute, setHighlightRoute] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const siteDetail = useQuery({ ...siteQuery(selectedSlug ?? ""), enabled: selectedSlug !== null });
  const routeDetail = useQuery({ ...journeyQuery(highlightRoute ?? ""), enabled: highlightRoute !== null });

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sites.data ?? []) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [sites.data]);

  const folkloreIds = useMemo(() => new Set((sites.data ?? []).filter(isFolkloreSite).map((s) => s.id)), [sites.data]);

  const visibleSites = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return (sites.data ?? []).filter((s) => {
      const inArchitecture = layers.architecture && (!category || s.category === category);
      const inFolklore = layers.folklore && folkloreIds.has(s.id);
      const matches =
        !needle ||
        s.name.toLocaleLowerCase().includes(needle) ||
        (s.district ?? "").toLocaleLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLocaleLowerCase().includes(needle));
      return (inArchitecture || inFolklore) && matches;
    });
  }, [sites.data, category, filter, layers.architecture, layers.folklore, folkloreIds]);

  const mapSites = useMemo<SitesGeoJSON | undefined>(() => {
    if (!sitesGeo.data) return undefined;
    const keep = new Set(visibleSites.map((s) => s.id));
    return {
      ...sitesGeo.data,
      features: sitesGeo.data.features
        .filter((f) => keep.has(f.properties.id))
        .map((f) => ({
          ...f,
          properties: { ...f.properties, folklore: layers.folklore && folkloreIds.has(f.properties.id) },
        })),
    };
  }, [sitesGeo.data, visibleSites, layers.folklore, folkloreIds]);

  const selected = sites.data?.find((s) => s.slug === selectedSlug) ?? null;
  const story = siteDetail.data?.slug === selectedSlug ? siteDetail.data : undefined;
  const selectedRoute = journeys.data?.find((j) => j.slug === highlightRoute) ?? null;

  const sitePlaces = useMemo(() => (sites.data ?? []).map(sitePlace), [sites.data]);
  const visibleRoutes = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return (journeys.data ?? []).filter((j) => !needle || j.title.toLocaleLowerCase().includes(needle));
  }, [journeys.data, filter]);

  const selectedPlace = selected ? sitePlace(selected) : null;
  const siteNearby = selectedPlace ? placesWithin(selectedPlace, sitePlaces) : [];
  const siteRelated = selected
    ? relatedSites(selected, sites.data ?? []).map((r) => ({ place: sitePlace(r.site), km: r.km, note: r.reason }))
    : [];
  const sitePlan = selectedPlace ? planDay(selectedPlace, sitePlaces) : null;

  const routeStops = useMemo(
    () =>
      (routeDetail.data?.stops ?? []).map((s) => ({
        place: {
          key: s.site ? `site-${s.site.id}` : `stop-${s.seq}`,
          name: s.title,
          slug: s.site?.slug,
          lat: s.lat,
          lon: s.lon,
        } satisfies Place,
        legKm: s.leg_km,
      })),
    [routeDetail.data],
  );
  const routePlaces = useMemo(() => routeStops.map((s) => s.place), [routeStops]);
  const routeNearby = useMemo(() => placesNearRoute(routePlaces, sitePlaces), [routePlaces, sitePlaces]);
  const routePlan = useMemo<DayPlan | null>(
    () => (routePlaces.length ? planDay(routePlaces[0], [...routePlaces, ...routeNearby.map((n) => n.place)]) : null),
    [routePlaces, routeNearby],
  );
  const folkloreEmpty = sites.isSuccess && folkloreIds.size === 0;
  const routesMessage = journeys.isError
    ? "Routes could not be loaded."
    : journeys.isSuccess && !journeys.data.length
      ? "No expedition routes are in this archive yet."
      : routesGeo.isSuccess && !routesGeo.data.features.length
        ? "Route lines are not available for this archive yet."
        : null;

  const selectSite = (site: SiteOut) => {
    setSelectedSlug(site.slug);
    setSelectedAsset(null);
    setFocus({ kind: "zoom", zoom: 13 });
  };

  const openPlace = (place: Place) => {
    const site = sites.data?.find((s) => s.slug === place.slug);
    if (site) selectSite(site);
  };

  const toggleRoute = (journey: JourneyOut) => {
    if (highlightRoute === journey.slug) {
      setHighlightRoute(null);
      setFocus(null);
      return;
    }
    setHighlightRoute(journey.slug);
    setSelectedSlug(null);
    setSelectedAsset(null);
    setLayers((l) => ({ ...l, routes: true }));
    if (journey.bbox) setFocus({ kind: "bounds", bbox: journey.bbox as [number, number, number, number], padding: 80 });
  };


  return (
    <section aria-labelledby="atlas-heading" className="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[400px_minmax(0,1fr)]">
      <h2 id="atlas-heading" className="sr-only">
        Interactive heritage atlas
      </h2>

      <div className="order-2 flex min-h-0 min-w-0 flex-col border-sandstone bg-parchment lg:order-1 lg:h-[calc(100dvh-60px)] lg:border-r">
        <div className="space-y-3 border-b border-sandstone p-4">

          <fieldset className="space-y-2">
            <legend className="eyebrow mb-1">Map layers</legend>
            <div className="flex flex-wrap gap-2 text-sm">
              <LayerToggle label="Routes" icon={Route} on={layers.routes} onChange={(v) => setLayers((l) => ({ ...l, routes: v }))} />
              <LayerToggle
                label="Folklore"
                icon={ScrollText}
                on={layers.folklore}
                onChange={(v) => setLayers((l) => ({ ...l, folklore: v }))}
              />
              <LayerToggle
                label="Architecture"
                icon={Landmark}
                on={layers.architecture}
                onChange={(v) => setLayers((l) => ({ ...l, architecture: v }))}
              />
              <LayerToggle
                label="Archive items"
                icon={Images}
                on={layers.archive}
                onChange={(v) => setLayers((l) => ({ ...l, archive: v }))}
              />
            </div>
            {layers.folklore && folkloreEmpty && (
              <p className="text-xs text-muted">No folklore records are tagged in this archive yet.</p>
            )}
          </fieldset>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <RouteList journeys={visibleRoutes} message={routesMessage} highlight={highlightRoute} onToggle={toggleRoute} />
          <SiteList
            loading={sites.isPending}
            error={sites.error}
            onRetry={() => void sites.refetch()}
            sites={visibleSites}
            total={sites.data?.length ?? 0}
            categories={categories}
            category={category}
            onCategory={setCategory}
            filter={filter}
            onFilter={setFilter}
            selectedSlug={selectedSlug}
            onSelect={selectSite}
          />
        </div>
      </div>

      <div className="relative order-1 h-[58vh] min-h-[360px] lg:order-2 lg:h-[calc(100dvh-60px)]">
        <AtlasMap
          label="Map of heritage sites, field routes and geotagged archive items"
          className="size-full"
          sites={mapSites}
          routes={routesGeo.data}
          assets={assetsGeo.data}
          showSites={layers.architecture || layers.folklore}
          showRoutes={layers.routes}
          showAssets={layers.archive}
          selectedSiteId={selected?.id ?? null}
          highlightRoute={highlightRoute}
          focus={focus}
          onSelectSite={(p) => {
            const site = sites.data?.find((s) => s.id === p.id);
            if (site) selectSite(site);
          }}
          onSelectAsset={(a) => {
            setSelectedAsset(a);
            setSelectedSlug(null);
          }}
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-start sm:inset-x-4 sm:bottom-4">
          {selected && (
            <SiteCard
              site={selected}
              story={story}
              storyFailed={siteDetail.isError}
              nearby={siteNearby}
              related={siteRelated}
              plan={sitePlan}
              onOpen={openPlace}
              onClose={() => setSelectedSlug(null)}
            />
          )}
          {!selected && !selectedAsset && selectedRoute && (
            <RouteCard
              journey={selectedRoute}
              detail={routeDetail}
              stops={routeStops}
              nearby={routeNearby}
              plan={routePlan}
              onOpen={openPlace}
              onClose={() => toggleRoute(selectedRoute)}
            />
          )}
          {selectedAsset && <AssetCard asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
        </div>
        <Legend categories={categories.map(([c]) => c)} folklore={layers.folklore} />
      </div>
    </section>
  );
}

function LayerToggle({
  label,
  icon: Icon,
  on,
  onChange,
}: {
  label: string;
  icon: typeof Landmark;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)} className="chip">
      <Icon aria-hidden className="size-3.5" />
      {label}
    </button>
  );
}

function RouteList({
  journeys,
  message,
  highlight,
  onToggle,
}: {
  journeys: JourneyOut[];
  message: string | null;
  highlight: string | null;
  onToggle: (journey: JourneyOut) => void;
}) {
  return (
    <section aria-labelledby="route-list-heading" className="space-y-2 px-4 pt-4">
      <h3 id="route-list-heading" className="eyebrow">
        Routes
      </h3>
      {message && <p className="text-xs text-muted">{message}</p>}
      {!message && !journeys.length && <p className="text-xs text-muted">No routes match this filter.</p>}
      <ul className="space-y-1">
        {journeys.map((j) => (
          <li key={j.slug} className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={highlight === j.slug}
              onClick={() => onToggle(j)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-white aria-pressed:bg-white aria-pressed:shadow-sm"
            >
              <span aria-hidden className="h-1 w-5 shrink-0 rounded-full" style={{ background: j.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{j.title}</span>
              <span className="shrink-0 text-xs text-muted">{j.stop_count} stops</span>
            </button>
            <Link href={`/journeys/${j.slug}`} className="shrink-0 text-xs font-semibold text-terracotta hover:underline">
              Open
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SiteList(props: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  sites: SiteOut[];
  total: number;
  categories: [string, number][];
  category: string | null;
  onCategory: (c: string | null) => void;
  filter: string;
  onFilter: (f: string) => void;
  selectedSlug: string | null;
  onSelect: (s: SiteOut) => void;
}) {
  if (props.error) return <ErrorState error={props.error} onRetry={props.onRetry} className="m-4" />;
  return (
    <div className="space-y-3 p-4">
      <div className="relative">
        <label htmlFor="site-filter" className="sr-only">
          Filter sites by name, district or tag
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          id="site-filter"
          type="search"
          value={props.filter}
          onChange={(e) => props.onFilter(e.target.value)}
          placeholder="Filter by name, district, tag…"
          className="field pl-9"
        />
      </div>
      <div>
        <label htmlFor="site-category" className="sr-only">
          Filter sites by category
        </label>
        <div className="relative">
          <select
            id="site-category"
            value={props.category ?? ""}
            onChange={(e) => props.onCategory(e.target.value || null)}
            className="field h-10 appearance-none rounded-xl bg-white pr-10 font-medium text-ink shadow-sm hover:border-terracotta/50 focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta/20 focus-visible:outline-none"
          >
            <option value="">All categories ({props.total})</option>
            {props.categories.map(([c, n]) => (
              <option key={c} value={c}>
                {titleCase(c)} ({n})
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
        </div>
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {props.loading ? "Loading sites…" : `Showing ${props.sites.length} of ${props.total} sites`}
      </p>
      <ul className="space-y-2">
        {props.loading &&
          Array.from({ length: 5 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-20" />
            </li>
          ))}
        {props.sites.map((s) => (
          <li key={s.slug}>
            <button
              type="button"
              aria-pressed={props.selectedSlug === s.slug}
              onClick={() => props.onSelect(s)}
              className="flex w-full gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-sandstone hover:bg-white aria-pressed:border-terracotta/40 aria-pressed:bg-white aria-pressed:shadow-sm"
            >
              <Thumb src={s.cover_url} alt="" className="size-16 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(s.category) }} />
                  <span className="truncate font-semibold">{s.name}</span>
                </span>

                <span className="mt-0.5 block truncate text-xs text-muted">
                  {titleCase(s.category)} · {s.era_label ?? formatEra(s.era_start, s.era_end)}
                  {s.district ? ` · ${s.district}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


function StoryTimeline({ story, failed }: { story: SiteDetail | undefined; failed: boolean }) {
  if (failed) {
    return <p className="border-t border-sandstone px-3 py-3 text-sm text-muted">The story could not be loaded.</p>;
  }
  if (!story) {
    return (
      <p aria-live="polite" className="border-t border-sandstone px-3 py-3 text-sm text-muted">
        Loading story…
      </p>
    );
  }
  const entries = buildSiteTimeline(story);
  return (
    <section aria-label="Timeline" className="border-t border-sandstone px-3 py-3">
      <h4 className="eyebrow mb-2">Timeline</h4>
      {entries.length ? (
        <ol className="space-y-2.5">
          {entries.map((e) => (
            <li key={e.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm">
              <span className="pt-0.5 text-xs font-semibold tabular-nums text-muted">{e.year ?? "Undated"}</span>
              <span className="min-w-0">
                {e.href ? (
                  <Link href={e.href} className="font-medium hover:underline">
                    {e.label}
                  </Link>
                ) : (
                  <span className="font-medium">{e.label}</span>
                )}
                {e.detail && <span className="block text-xs text-muted">{e.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">No dated records for this site yet.</p>
      )}
    </section>
  );
}

function SiteCard({
  site,
  story,
  storyFailed,
  nearby,
  related,
  plan,
  onOpen,
  onClose,
}: {
  site: SiteOut;
  story: SiteDetail | undefined;
  storyFailed: boolean;
  nearby: NearbyPlace[];
  related: NearbyPlace[];
  plan: DayPlan | null;
  onOpen: (place: Place) => void;
  onClose: () => void;
}) {
  return (
    <article
      aria-label={`Selected site: ${site.name}`}
      className="card pointer-events-auto flex max-h-[min(70vh,560px)] w-full max-w-md flex-col overflow-y-auto shadow-[var(--shadow-lift)]"
    >
      <div className="flex gap-3 p-3">
        {site.cover_source_url ? (
          <a
            href={site.cover_source_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${site.name} photo source (opens Wikimedia Commons)`}
            className="shrink-0"
          >
            <Thumb src={site.cover_url} alt="" className="size-24 rounded-lg" />
          </a>
        ) : (
          <Thumb src={site.cover_url} alt={site.name} className="size-24 shrink-0 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 font-serif text-xl leading-tight font-semibold">{site.name}</h3>
            <button type="button" onClick={onClose} className="-m-1 rounded p-1 text-muted hover:text-ink" aria-label="Close">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{site.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {site.unesco && <Badge tone="ochre">UNESCO</Badge>}
            {isFolkloreSite(site) && <Badge>Folklore</Badge>}
            <Badge>{site.asset_count} items</Badge>
            {site.twin_count > 0 && (
              <Badge tone="indigo">
                <Box aria-hidden className="size-3" /> 3D twin
              </Badge>
            )}
            <Link href={`/sites/${site.slug}`} className="ml-auto text-sm font-semibold text-terracotta hover:underline">
              Open site →
            </Link>
          </div>
        </div>
      </div>
      <StoryTimeline story={story} failed={storyFailed} />
      <div className="space-y-4 border-t border-sandstone px-3 py-3">
        <section aria-label={`Within ${NEARBY_RADIUS_KM} km`}>
          <h4 className="eyebrow mb-2">Within {NEARBY_RADIUS_KM} km</h4>
          <PlaceList items={nearby} onOpen={onOpen} empty={`No other heritage sites in this archive lie within ${NEARBY_RADIUS_KM} km.`} />
        </section>
        <section aria-label="Suggested one-day itinerary">
          <h4 className="eyebrow mb-2">Suggested one-day itinerary</h4>
          <DayPlanView start={site.name} plan={plan} onOpen={onOpen} />
        </section>
        {related.length > 0 && (
          <section aria-label="Related heritage sites">
            <h4 className="eyebrow mb-2">Related heritage sites</h4>
            <PlaceList items={related} onOpen={onOpen} />
          </section>
        )}
      </div>
    </article>
  );
}

function RouteCard({
  journey,
  detail,
  stops,
  nearby,
  plan,
  onOpen,
  onClose,
}: {
  journey: JourneyOut;
  detail: { isPending: boolean; isError: boolean };
  stops: { place: Place; legKm: number }[];
  nearby: NearbyPlace[];
  plan: DayPlan | null;
  onOpen: (place: Place) => void;
  onClose: () => void;
}) {
  return (
    <article
      aria-label={`Selected route: ${journey.title}`}
      className="card pointer-events-auto flex max-h-[min(70vh,560px)] w-full max-w-md flex-col overflow-y-auto shadow-[var(--shadow-lift)]"
    >
      <div className="flex gap-3 p-3">
        <Thumb src={journey.cover_url} alt="" className="size-24 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 font-serif text-xl leading-tight font-semibold">{journey.title}</h3>
            <button type="button" onClick={onClose} className="-m-1 rounded p-1 text-muted hover:text-ink" aria-label="Close">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">
            {journey.year} · {journey.stop_count} stops
            {journey.distance_km > 0 && ` · about ${Math.round(journey.distance_km)} km across stops`}
          </p>
          <Link href={`/journeys/${journey.slug}`} className="mt-2 inline-block text-sm font-semibold text-terracotta hover:underline">
            Open route →
          </Link>
        </div>
      </div>
      <div className="space-y-4 border-t border-sandstone px-3 py-3">
        <section aria-label="Route stops">
          <h4 className="eyebrow mb-2">Stops</h4>
          {detail.isPending && <p className="text-sm text-muted">Loading stops…</p>}
          {detail.isError && <p className="text-sm text-muted">The route stops could not be loaded.</p>}
          {!detail.isPending && !detail.isError && !stops.length && (
            <p className="text-sm text-muted">No stops are recorded for this route yet.</p>
          )}
          <ol className="space-y-1.5 text-sm">
            {stops.map((s, i) => (
              <li key={s.place.key} className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sand text-xs font-semibold">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <PlaceName place={s.place} onOpen={onOpen} />
                </span>
                {i > 0 && <span className="shrink-0 text-xs text-muted tabular-nums">{Math.round(s.legKm)} km</span>}
              </li>
            ))}
          </ol>
        </section>
        <section aria-label={`Within ${NEARBY_RADIUS_KM} km of this route`}>
          <h4 className="eyebrow mb-2">Within {NEARBY_RADIUS_KM} km of this route</h4>
          <PlaceList items={nearby} onOpen={onOpen} empty="No other heritage sites lie within reach of this route." />
        </section>
        <section aria-label="Suggested one-day itinerary">
          <h4 className="eyebrow mb-2">Suggested one-day itinerary</h4>
          <DayPlanView start={stops[0]?.place.name} plan={plan} onOpen={onOpen} />
        </section>
      </div>
    </article>
  );
}

function PlaceName({ place, onOpen }: { place: Place; onOpen: (place: Place) => void }) {
  if (!place.slug) return <span className="block truncate font-medium">{place.name}</span>;
  return (
    <button type="button" onClick={() => onOpen(place)} className="block w-full truncate text-left font-medium hover:underline">
      {place.name}
    </button>
  );
}

function PlaceList({
  items,
  onOpen,
  empty,
}: {
  items: (NearbyPlace & { note?: string })[];
  onOpen: (place: Place) => void;
  empty?: string;
}) {
  if (!items.length) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map(({ place, km, note }) => (
        <li key={place.key} className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <PlaceName place={place} onOpen={onOpen} />
            {note && <span className="block truncate text-xs text-muted">{note}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">{Math.round(km)} km</span>
        </li>
      ))}
    </ul>
  );
}

function DayPlanView({ start, plan, onOpen }: { start?: string; plan: DayPlan | null; onOpen: (place: Place) => void }) {
  if (!plan) return <p className="text-sm text-muted">Choose a place to plan a day.</p>;
  if (!plan.stops.length) {
    return <p className="text-sm text-muted">No other heritage sites lie within {NEARBY_RADIUS_KM} km for a same-day stop.</p>;
  }
  return (
    <>
      {start && <p className="mb-2 text-xs text-muted">Starting from {start}</p>}
      <ol className="space-y-1.5 text-sm">
        {plan.stops.map((p, i) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sand text-xs font-semibold">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <PlaceName place={p} onOpen={onOpen} />
            </span>
            <span className="shrink-0 text-xs text-muted tabular-nums">{Math.round(plan.legKm[i])} km</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">
        Straight-line distances, about {Math.round(plan.totalKm)} km in total. Check road routes and travel times before setting out.
      </p>
    </>
  );
}

function AssetCard({ asset, onClose }: { asset: AssetFeatureProps; onClose: () => void }) {
  return (
    <article
      aria-label={`Selected item: ${asset.title}`}
      className="card pointer-events-auto flex w-full max-w-sm gap-3 p-3 shadow-[var(--shadow-lift)]"
    >
      <Thumb src={asset.thumb_url} alt="" kind={asset.kind} className="size-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 flex-1 font-semibold">{asset.title}</h3>
          <button type="button" onClick={onClose} className="-m-1 rounded p-1 text-muted hover:text-ink" aria-label="Close">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted">
          {kindLabel(asset.kind)}
          {asset.geo_source && ` · located by ${asset.geo_source.replace(/_/g, " ")}`}
        </p>
        <Link href={`/assets/${asset.id}`} className="mt-1 inline-block text-sm font-semibold text-terracotta hover:underline">
          View item →
        </Link>
      </div>
    </article>
  );
}

function Legend({ categories, folklore }: { categories: string[]; folklore: boolean }) {
  if (!categories.length) return null;
  return (
    <details className="card absolute top-3 left-3 max-w-[220px] text-xs shadow-[var(--shadow-lift)]">
      <summary className="cursor-pointer px-3 py-2 font-semibold">Legend</summary>
      <ul className="space-y-1 px-3 pb-3">
        {categories.map((c) => (
          <li key={c} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full border border-white" style={{ background: categoryColor(c) }} />
            {titleCase(c)}
          </li>
        ))}
        {folklore && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full border border-white" style={{ background: FOLKLORE_COLOR }} />
            Folklore
          </li>
        )}
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-full border-2 border-amber-400 bg-white" />
          UNESCO World Heritage
        </li>

      </ul>
    </details>
  );
}
