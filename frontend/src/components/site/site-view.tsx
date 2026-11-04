"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Info, MapPin, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { SketchfabEmbed } from "@/components/site/sketchfab-embed";
import { Badge, EmptyState, ErrorState, LoadingBlock, SectionHeading } from "@/components/ui/primitives";
import { Thumb } from "@/components/ui/thumb";
import { TwinViewer } from "@/components/viewer";
import { keys, modelModesQuery, siteQuery } from "@/lib/api/queries";
import type { ModelMode, SiteDetail } from "@/lib/api/types";
import { MODEL_MODE_OPTIONS, useSiteModelSession, type ModelModeId } from "@/lib/model-session";
import {
  categoryColor,
  formatEra,
  formatKm,
  formatNumber,
  languageName,
  scriptLang,
  titleCase,
} from "@/lib/format";
import { SKETCHFAB_MODEL_NOTES, SKETCHFAB_MODELS } from "@/data/sketchfab-models";

const METHOD_LABEL: Record<string, string> = {
  "depth-relief": "Depth relief",
  "gaussian-splat": "Gaussian splat",
  procedural: "Procedural typology",
};

export function SiteView({ initial }: { initial: SiteDetail }) {
  const { data: site } = useQuery({ ...siteQuery(initial.slug), initialData: initial });
  const latinAltNames = site.alt_names.filter((n) => !scriptLang(n));
  const sketchfabId = SKETCHFAB_MODELS[site.slug];

  return (
    <article>
      <header className="relative isolate overflow-hidden bg-ink text-white">
        {site.cover_url && (
          <Thumb
            src={site.cover_url}
            alt=""
            eager
            className="absolute inset-0 -z-10 size-full opacity-55"
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
        <div className="mx-auto max-w-7xl px-4 pt-24 pb-8 sm:pt-32">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-white/75">
            <Link href="/sites" className="hover:text-white hover:underline">
              Sites
            </Link>{" "}
            / <span aria-current="page">{site.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-white/20 bg-white/15 text-white">
              <span aria-hidden className="size-2 rounded-full" style={{ background: categoryColor(site.category) }} />
              {titleCase(site.category)}
            </Badge>
            {site.unesco && <Badge tone="ochre">UNESCO World Heritage</Badge>}
            {site.twin_count > 0 && (
              <Badge tone="indigo">
                <Box aria-hidden className="size-3" /> 3D twin
              </Badge>
            )}
          </div>
          <h1 className="mt-2 text-5xl font-semibold sm:text-6xl">{site.name}</h1>

          <p className="mt-3 max-w-3xl text-lg text-white/85">{site.summary}</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
            <span className="flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {[site.district, site.state].filter(Boolean).join(", ") || "India"}
            </span>
            <span>{site.era_label ?? formatEra(site.era_start, site.era_end)}</span>
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-12">
          {site.description && (
            <section aria-labelledby="about">
              <SectionHeading id="about" eyebrow="About" title="The site" />
              <div className="max-w-prose space-y-3 text-lg leading-relaxed text-ink-soft">
                {site.description.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}

          {sketchfabId ? (
            <SketchfabSection uid={sketchfabId} title={site.name} note={SKETCHFAB_MODEL_NOTES[site.slug]} />
          ) : (
            <ModelSection site={site} />
          )}
        </div>

        <aside className="space-y-6" aria-label="Site facts">
          <section className="card p-5">
            <h2 className="mb-3 text-xl font-semibold">At a glance</h2>
            <dl className="space-y-3 text-sm">
              <Fact label="Period">
                {formatEra(site.era_start, site.era_end)}
                {site.era_label && <span className="block text-muted">{site.era_label}</span>}
              </Fact>
              <EraBar start={site.era_start} end={site.era_end} />
              <Fact label="Location">
                {[site.district, site.state].filter(Boolean).join(", ")}
                <span className="block font-mono text-xs text-muted">
                  {site.lat.toFixed(4)}°N, {site.lon.toFixed(4)}°E
                </span>
              </Fact>
              {latinAltNames.length > 0 && (
                <Fact label="Also known as">
                  <ul>
                    {latinAltNames.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </Fact>
              )}
              {Object.keys(site.languages).length > 0 && (
                <Fact label="Languages in the archive">
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(site.languages).map(([code, n]) => (
                      <li key={code}>
                        <Badge>
                          {languageName(code)} <span className="text-muted">{formatNumber(n)}</span>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </Fact>
              )}
              {site.tags.length > 0 && (
                <Fact label="Tags">
                  <span className="flex flex-wrap gap-1">
                    {site.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </span>
                </Fact>
              )}
            </dl>
          </section>


          {site.nearby.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-xl font-semibold">Nearby</h2>
              <ul className="space-y-2 text-sm">
                {site.nearby.map((n) => (
                  <li key={n.slug} className="flex items-center gap-2">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: categoryColor(n.category) }} />
                    <Link href={`/sites/${n.slug}`} className="flex-1 font-semibold hover:underline">
                      {n.name}
                    </Link>
                    <span className="text-muted tabular-nums">{formatKm(n.distance_km)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}

function SketchfabSection({ uid, title, note }: { uid: string; title: string; note?: string }) {
  return (
    <section aria-labelledby="twin">
      <SectionHeading id="twin" eyebrow="Digital twin" title="Explore this site in 3D" />
      <SketchfabEmbed uid={uid} title={`${title} 3D model`} note={note} />
    </section>
  );
}

function ModelSection({ site }: { site: SiteDetail }) {
  const session = useSiteModelSession(site.id, site.slug);
  const { setLoading } = session;
  const queryClient = useQueryClient();
  // Before the session effect runs (the first render after navigation) the store still describes
  // the previous site. Treat that as a fresh viewer rather than showing another site's mode.
  const bound = session.siteId === site.id && session.siteSlug === site.slug;
  const mode: ModelModeId = bound ? session.mode : "procedural";
  const stopped = bound && session.stopped;
  const modes = useQuery(modelModesQuery(site.slug));
  const info = modes.data?.modes.find((m) => m.id === mode);
  const twin = info?.twin ?? null;
  const label = MODEL_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "Model";

  useEffect(() => {
    if (bound) setLoading(site.slug, modes.isPending);
  }, [bound, modes.isPending, setLoading, site.slug]);

  // Switching location unmounts this section: abort the old site's in-flight mode request so a
  // late response can never populate the viewer for the new location.
  useEffect(
    () => () => {
      void queryClient.cancelQueries({ queryKey: keys.modelModes(site.slug) });
    },
    [queryClient, site.slug],
  );

  return (
    <section aria-labelledby="twin">
      <SectionHeading id="twin" eyebrow="Digital twin" title="Explore this site in 3D">
        <div className="flex items-center gap-2">
          <label htmlFor="model-mode" className="text-sm font-semibold">
            Model
          </label>
          <select
            id="model-mode"
            className="field h-10 w-auto py-1"
            value={mode}
            onChange={(event) => session.selectMode(site.id, event.target.value as ModelModeId)}
          >
            {MODEL_MODE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </SectionHeading>

      {modes.isPending && <LoadingBlock label="Preparing the three model modes…" />}
      {modes.isError && <ErrorState error={modes.error} onRetry={() => void modes.refetch()} />}

      {modes.data &&
        (stopped ? (
          <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-sandstone bg-sand/60 p-5">
            <p className="text-sm text-ink-soft">
              <strong className="block text-ink">Viewer stopped.</strong>
              The 3D viewer is closed locally. A reconstruction job on the archive server is not affected by
              this; use <strong>Stop Processing</strong> below if you want to cancel it.
            </p>
            <button type="button" className="btn btn-secondary" onClick={session.resumeViewing}>
              <Play aria-hidden className="size-4" /> Resume viewing
            </button>
          </div>
        ) : twin && info?.available ? (
          <TwinViewer
            key={`${site.slug}-${twin.id}`}
            twin={twin}
            mode={mode}
            onStopViewing={session.stopViewing}
          />
        ) : (
          <EmptyState title={`${label} is not available`} icon={<Box aria-hidden className="size-8 text-muted" />}>
            <p>{info?.reason ?? "This model has not been built for this site yet."}</p>
          </EmptyState>
        ))}

      {modes.data && twin && info?.available && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Badge tone="indigo">{METHOD_LABEL[twin.method] ?? titleCase(twin.method)}</Badge>
          {twin.point_count != null && (
            <Badge>
              {formatNumber(twin.point_count)} {twin.format === "glb" ? "vertices" : "points"}
            </Badge>
          )}
          {mode === "procedural" && <Badge tone="ochre">Approximate reconstruction</Badge>}
          {mode === "wireframe" && <Badge tone="indigo">Wireframe of the stored mesh</Badge>}
          {twin.source_asset_ids.length > 0 && (
            <Badge>from {twin.source_asset_ids.length} photographs</Badge>
          )}
        </div>
      )}

      {modes.data && mode === "procedural" && info?.available && <ProceduralNote info={info} />}
      {modes.data && mode === "wireframe" && info?.available && (
        <p className="mt-3 flex gap-2 rounded-lg border border-indigo-ink/20 bg-indigo-soft/40 p-3 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-indigo-ink" />
          These edges are drawn from the actual triangles of the stored mesh, not a decorative overlay.
        </p>
      )}

    </section>
  );
}

function ProceduralNote({ info }: { info: ModelMode }) {
  const parameters = Object.entries(info.parameters ?? {});
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-ochre/30 bg-ochre-soft/60 p-3 text-sm">
      <p className="flex gap-2">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ochre" />
        <span>
          <strong>Approximate reconstruction. </strong>
          {info.disclaimer ??
            "Generated from this site's typology and published dimensions, not a measured survey."}
        </span>
      </p>
      <details>
        <summary className="cursor-pointer font-semibold">Parameters used</summary>
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {parameters.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 border-b border-ochre/15 py-0.5">
              <dt className="text-muted">{titleCase(key.replace(/_/g, " "))}</dt>
              <dd className="font-mono tabular-nums">{String(value)}</dd>
            </div>
          ))}
        </dl>
        {info.required?.length ? (
          <p className="mt-2">
            <span className="font-semibold">Required inputs:</span> {info.required.join(", ")}
          </p>
        ) : null}
        {info.optional?.length ? (
          <p>
            <span className="font-semibold">Optional inputs:</span> {info.optional.join(", ")}
          </p>
        ) : null}
        {info.estimated?.length ? (
          <p>
            <span className="font-semibold">Estimated:</span> {info.estimated.join(", ")}
          </p>
        ) : null}
      </details>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

const TIMELINE = { from: -3000, to: 2000 };

/** Where the site sits on a 5,000-year axis (Harappan to present) — gives undated visitors scale. */
function EraBar({ start, end }: { start: number | null; end: number | null }) {
  if (start == null && end == null) return null;
  const span = TIMELINE.to - TIMELINE.from;
  const pct = (y: number) => Math.min(100, Math.max(0, ((y - TIMELINE.from) / span) * 100));
  const a = pct(start ?? end!);
  const b = pct(end ?? start!);
  return (
    <div aria-hidden className="pt-1 pb-4">
      <div className="relative h-2 rounded-full bg-sand">
        <div
          className="absolute inset-y-0 rounded-full bg-terracotta"
          style={{ left: `${a}%`, width: `${Math.max(1.2, b - a)}%` }}
        />
        <span className="absolute top-3 left-0 text-[10px] text-muted">3000 BCE</span>
        <span className="absolute top-3 left-[60%] -translate-x-1/2 text-[10px] text-muted">0</span>
        <span className="absolute top-3 right-0 text-[10px] text-muted">2000 CE</span>
      </div>
    </div>
  );
}
