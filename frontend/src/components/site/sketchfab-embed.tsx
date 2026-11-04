import { Info } from "lucide-react";

import { sketchfabEmbedUrl, sketchfabModelUrl } from "@/data/sketchfab-models";

type SketchfabEmbedProps = {
  uid: string;
  title: string;
  onLoad?: () => void;
  /** Caveat shown below the viewer when a third-party model is generic or ambiguous. */
  note?: string;
  showFooter?: boolean;
};

export function SketchfabEmbed({ uid, title, onLoad, note, showFooter = true }: SketchfabEmbedProps) {
  return (
    <div className="w-full overflow-hidden bg-black text-white">
      <div className="relative aspect-video w-full">
        <iframe
          title={title}
          src={sketchfabEmbedUrl(uid)}
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onLoad}
          className="absolute inset-0 size-full border-0"
        />
      </div>
      {showFooter && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-white/10 bg-ink px-3 py-2 text-xs">
          {note ? (
            <p className="flex max-w-prose gap-1.5 text-white/70">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{note}</span>
            </p>
          ) : (
            <span />
          )}
          <a
            href={sketchfabModelUrl(uid)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-white"
          >
            Open 3D model on Sketchfab
          </a>
        </div>
      )}
    </div>
  );
}
