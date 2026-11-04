# virasat3d: one project, four ways in

virasat3d turns scattered heritage material (scanned notebooks, PDFs, field journals, untagged photographs) into an
archive you can search, place on a map and explore in 3D. Pick the section that fits you.

1. [For judges: the 2-minute pitch](#1-for-judges-the-2-minute-pitch)
2. [For developers: how it is built](#2-for-developers-how-it-is-built)
3. [For visitors: what you can explore](#3-for-visitors-what-you-can-explore)
4. [For researchers and institutions: what it means for an archive](#4-for-researchers-and-institutions-what-it-means-for-an-archive)

---

## 1. For judges: the 2-minute pitch

**The problem.** Decades of fieldwork on India's built heritage are stuck in folders nobody can search. The text is in
Gujarati, Hindi, Marathi, Sanskrit and English, a lot of it is only an image of a page, and no note is linked to the
place it describes.

**The answer.** Upload the material and virasat3d reads it, translates it, places it on a map, and rebuilds sites in
3D from the photographs already in the archive.

**The moment to watch for in the demo.** Search `વાવ`, then `बावड़ी`, then `vav`, then `stepwell`. All four return the
same stepwells, because search understands spelling across scripts.

| What judges look for | Where virasat3d answers it |
|---|---|
| **Technical execution** | Typed end to end: API schemas generate the TypeScript client, so a backend change that breaks the UI fails the build. Automated tests, linting and type checks run in CI. |
| **Architecture and scale** | A stateless API, a durable job queue with separate CPU and GPU lanes, and GPU workers that pull jobs over outbound HTTPS so any number can join. SQLite for a laptop, PostgreSQL for production. |
| **UI and UX** | A map-first atlas, a side-by-side reader, live progress on uploads, and layouts checked at phone width. |
| **Innovation and fit** | Cross-script matching for Indic place names, three search methods merged into one ranking, photo search by description, and 3D built from photos the archive already has. |

**Honest limits.** A single photo gives a depth relief, not a full model. Large monuments need many photos. Free
hosting resets uploads on restart. These are noted so nobody is surprised.

---

## 2. For developers: how it is built

```text
Browser (Next.js)  ──▶  FastAPI  ──▶  SQLite / PostgreSQL + file storage
       ▲  live events      │  job queue: cpu | gpu
       └───────────────────┘
                           ▲  workers pull over HTTPS
                  GPU worker (Colab): OCR, translation, captions, 3D
```

**Pipeline.** Upload → type and size check, hash de-duplication → extract text (OCR only for image-only pages) →
split into passages, tag places, sites and dates, add geotags → translate non-English text → embed photos.
Every step is a small job that is safe to run twice.

**Queue.** At-least-once delivery. PostgreSQL uses `SELECT … FOR UPDATE SKIP LOCKED`; SQLite uses a compare-and-set
update. Jobs carry leases and heartbeats, retry with capped exponential backoff, and move to a dead-letter state after
repeated failures.

**Search.** Keyword, multilingual embeddings and a phonetic key are retrieved separately, then merged with Reciprocal
Rank Fusion.

**Stack.** Next.js 16, React 19, Tailwind v4, TanStack Query, MapLibre and three.js on the front; FastAPI, SQLAlchemy
and Alembic on the back; Tesseract or Qwen2.5-VL, IndicTrans2 or NLLB-200, BLIP, Depth Anything V2, COLMAP and gsplat
on the GPU worker.

**Run it.**

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[ml,dev]"
python -m app.cli migrate && python -m app.cli seed && python -m app.cli serve

cd ../frontend && npm install && npm run dev
```

**Check it.** `pytest --cov`, `ruff check`, `mypy app` in `backend/`; `pytest` in `ml/`; `npm run lint`,
`npm run typecheck`, `npm test` in `frontend/`. After changing API schemas, export the OpenAPI spec and run
`npm run gen:api`.

**Contributing tips.** Handlers must stay idempotent. Keep new settings in `HL_*` environment variables and add them to
`.env.example`. Do not run the fake GPU worker against a real database.

---

## 3. For visitors: what you can explore

- **The map.** Heritage sites, geotagged photographs and expedition routes on one map. Tap a place to see what the
  archive holds about it.
- **Journeys.** Follow an expedition one stop at a time in story mode.
- **Search.** Look something up in any script you like. Results show the matching passage with an English translation.
- **Documents.** Read an old field journal beside its English version, with places and dates highlighted.
- **3D twins.** Open a site's model in your browser and turn it around. Some twins come from one photo, others from
  many.
- **Add your own.** Have photos or notes from a visit? Upload them, add where they were taken, and watch them get
  read and added to the map.

**Good first searches:** `stepwell`, `वाव`, `Rani ki Vav`.

**Coming next: Culture.** A section of image cards for crafts, folk dance, festivals and theatre, so the living
traditions around each site sit beside its stones.

---

## 4. For researchers and institutions: what it means for an archive

**What you get.** Material you already hold becomes findable without retyping it: scans are read with OCR,
non-English text gets an English translation next to the original, and every passage keeps its source, so you can see
where a claim came from.

**Place as the organising idea.** Passages and photographs are linked to sites through EXIF data, manual entry, the
site they were filed under, or a place named in the text. A researcher can start from a site and see everything
about it, or start from a question and see where it leads.

**Languages.** Gujarati, Hindi, Marathi, Sanskrit and English are handled for OCR and search. Spelling variants of
place names, such as `વાવ`, `बावड़ी` and `vav`, are matched together.

**Photographs.** Untagged photos can be found by description and used to build 3D reconstructions of sites. Treat
single-photo reliefs as visual aids, not measurements. Survey-grade geometry still needs scanning or full
photogrammetry.

**Running it.** The platform runs on a laptop or a small server, stores files locally or in S3-compatible storage,
and uses a free Colab GPU for heavy jobs. Your files stay in storage you control.

**Rights and responsibility.**
- Check the licence of every image before publishing. Sample photos come from Wikimedia Commons with the author and
  licence shown.
- The sample journals and oral histories are synthetic and meant for demonstration only.
- Some optional models are licensed for non-commercial use. An institution deploying commercially should use the
  permissive options: Tesseract, IndicTrans2, and COLMAP with gsplat.
- OCR and translation can be wrong, especially on handwriting. Keep the original beside the translation and have an
  expert review anything you cite.