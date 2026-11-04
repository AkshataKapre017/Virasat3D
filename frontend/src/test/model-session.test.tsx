import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MODEL_MODE_OPTIONS,
  ModelSessionProvider,
  useSiteModelSession,
  type ModelModeId,
} from "@/lib/model-session";

function Harness({ siteId, slug }: { siteId: number; slug: string }) {
  const session = useSiteModelSession(siteId, slug);
  return (
    <div>
      <output data-testid="site">{session.siteSlug ?? "none"}</output>
      <output data-testid="mode">{session.mode}</output>
      <output data-testid="job">{session.jobId ?? "none"}</output>
      <output data-testid="loading">{String(session.loading)}</output>
      <output data-testid="stopped">{String(session.stopped)}</output>
      <button type="button" onClick={() => session.selectMode(siteId, "wireframe")}>
        wire
      </button>
      <button type="button" onClick={() => session.selectMode(999, "detailed")}>
        stale mode
      </button>
      <button type="button" onClick={() => session.setJob(slug, 42)}>
        job
      </button>
      <button type="button" onClick={() => session.setJob("another-site", 99)}>
        stale job
      </button>
      <button type="button" onClick={() => session.setLoading(slug, true)}>
        loading
      </button>
      <button type="button" onClick={() => session.stopViewing()}>
        stop
      </button>
      <button type="button" onClick={() => session.resumeViewing()}>
        resume
      </button>
    </div>
  );
}

function renderHarness(siteId = 1, slug = "rani-ki-vav") {
  return render(
    <ModelSessionProvider>
      <Harness siteId={siteId} slug={slug} />
    </ModelSessionProvider>,
  );
}

afterEach(cleanup);

describe("model mode options", () => {
  it("offers exactly the three requested modes", () => {
    expect(MODEL_MODE_OPTIONS.map((option) => option.id)).toEqual<ModelModeId[]>([
      "procedural",
      "detailed",
      "wireframe",
    ]);
    expect(MODEL_MODE_OPTIONS.map((option) => option.label)).toEqual([
      "Procedural Typology Model",
      "Detailed 3D Model",
      "Wireframe Model",
    ]);
  });
});

describe("model session", () => {
  it("binds to the rendered site and keeps the mode scoped to it", () => {
    renderHarness();
    expect(screen.getByTestId("site").textContent).toBe("rani-ki-vav");
    expect(screen.getByTestId("mode").textContent).toBe("procedural");

    act(() => screen.getByRole("button", { name: "wire" }).click());
    expect(screen.getByTestId("mode").textContent).toBe("wireframe");
    expect(screen.getByTestId("site").textContent).toBe("rani-ki-vav");

    // A late selection aimed at a previous site is ignored.
    act(() => screen.getByRole("button", { name: "stale mode" }).click());
    expect(screen.getByTestId("mode").textContent).toBe("wireframe");
  });

  it("tracks the job id and ignores events for another site", () => {
    renderHarness();
    act(() => screen.getByRole("button", { name: "job" }).click());
    expect(screen.getByTestId("job").textContent).toBe("42");

    act(() => screen.getByRole("button", { name: "stale job" }).click());
    expect(screen.getByTestId("job").textContent).toBe("42");
  });

  it("tracks loading separately from the mode and job", () => {
    renderHarness();
    act(() => screen.getByRole("button", { name: "loading" }).click());
    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("mode").textContent).toBe("procedural");
  });

  it("stops only the local viewer and can resume without changing the site", () => {
    renderHarness();
    act(() => screen.getByRole("button", { name: "stop" }).click());
    expect(screen.getByTestId("stopped").textContent).toBe("true");

    act(() => screen.getByRole("button", { name: "resume" }).click());
    expect(screen.getByTestId("stopped").textContent).toBe("false");
    expect(screen.getByTestId("site").textContent).toBe("rani-ki-vav");
  });

  it("resets mode, job and stopped state when the active location changes", () => {
    const view = renderHarness(1, "rani-ki-vav");
    act(() => screen.getByRole("button", { name: "wire" }).click());
    act(() => screen.getByRole("button", { name: "job" }).click());
    act(() => screen.getByRole("button", { name: "stop" }).click());

    view.rerender(
      <ModelSessionProvider>
        <Harness siteId={2} slug="adalaj" />
      </ModelSessionProvider>,
    );

    expect(screen.getByTestId("site").textContent).toBe("adalaj");
    expect(screen.getByTestId("mode").textContent).toBe("procedural");
    expect(screen.getByTestId("job").textContent).toBe("none");
    expect(screen.getByTestId("stopped").textContent).toBe("false");
  });
});
