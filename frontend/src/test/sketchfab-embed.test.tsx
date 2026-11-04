import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SketchfabEmbed } from "@/components/site/sketchfab-embed";
import { SKETCHFAB_MODELS, SKETCHFAB_MODEL_NOTES } from "@/data/sketchfab-models";

const REQUESTED = {
  sanchi: "2fd62cd6ee804455bda1ad0a324080cb",
  khajuraho: "dd99586619e74f24b8dec10cc009c360",
  konark: "52c2f9e811fe421a8b5e968e05372db2",
  "victoria-memorial": "1b3ec6a1a07949d08221f718fd1919d4",
  "qutub-minar": "e165e25ec8f1497aa83ab72419f40ddc",
  "taj-mahal": "875f29cfeb4a4518bb6516f775abcf37",
};

afterEach(cleanup);

describe("<SketchfabEmbed>", () => {
  it("maps every requested site to its supplied model", () => {
    for (const [slug, uid] of Object.entries(REQUESTED)) {
      expect(SKETCHFAB_MODELS[slug]).toBe(uid);
    }
    expect(SKETCHFAB_MODEL_NOTES.khajuraho).toMatch(/generic temple study/i);
    expect(SKETCHFAB_MODEL_NOTES["taj-mahal"]).toMatch(/Taj Mahal Palace/i);
  });

  it("uses a safe iframe and always links back to the Sketchfab model", () => {
    render(<SketchfabEmbed uid="abc123" title="Konark Sun Temple 3D model" note="Interpretive model" />);

    const frame = screen.getByTitle("Konark Sun Temple 3D model");
    expect(frame.getAttribute("src")).toContain("/models/abc123/embed");
    expect(frame.getAttribute("allow")).toContain("fullscreen");
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(frame.hasAttribute("allowfullscreen")).toBe(true);

    const link = screen.getByRole("link", { name: /Open 3D model on Sketchfab/i });
    expect(link.getAttribute("href")).toBe("https://sketchfab.com/models/abc123");
    expect(screen.getByText("Interpretive model")).toBeTruthy();
  });

  it("can omit the footer when embedded inside a listing card", () => {
    render(<SketchfabEmbed uid="abc123" title="Card model" showFooter={false} />);
    expect(screen.queryByRole("link", { name: /Open 3D model on Sketchfab/i })).toBeNull();
  });
});
