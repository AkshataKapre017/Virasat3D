"use client";

import { useId, useMemo, useState } from "react";

import { HotelCard } from "@/components/heritage-hotels/hotel-card";
import {
  HERITAGE_CATEGORIES,
  filterHotels,
  groupByState,
  stateOptions,
  type HeritageHotelsData,
  type HotelFilters,
} from "@/lib/heritage-hotels";

const NO_FILTERS: HotelFilters = { state: "", category: "", query: "" };

const CATEGORY_NOTES = [
  { category: "Heritage Grand", note: "built before 1920" },
  { category: "Heritage Classic", note: "built between 1920 and 1935" },
  { category: "Heritage", note: "built between 1935 and 1950" },
];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function HeritageHotels({ data }: { data: HeritageHotelsData }) {
  const ids = {
    state: useId(),
    category: useId(),
    query: useId(),
  };
  const [filters, setFilters] = useState<HotelFilters>(NO_FILTERS);

  const states = useMemo(() => stateOptions(data.hotels), [data.hotels]);
  const matches = useMemo(() => filterHotels(data.hotels, filters), [data.hotels, filters]);
  const groups = useMemo(() => groupByState(matches), [matches]);

  const hasFilters = filters.state !== "" || filters.category !== "" || filters.query.trim() !== "";
  const countText = matches.length === 1 ? "Showing 1 hotel" : `Showing ${matches.length} hotels`;

  return (
    <div className="hh-wrap">
      <header className="hh-header">
        <h1 className="hh-title">Heritage Hotels across India</h1>
        <p className="hh-intro">
          Heritage hotels are forts, palaces and havelis converted into hotels, so guests can stay in historic
          buildings.
        </p>
      </header>

      <form role="search" className="hh-filters" onSubmit={(event) => event.preventDefault()}>
        <div className="hh-field">
          <label htmlFor={ids.state}>State</label>
          <select
            id={ids.state}
            className="hh-control"
            value={filters.state}
            onChange={(event) => setFilters({ ...filters, state: event.target.value })}
          >
            <option value="">All states</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        <div className="hh-field">
          <label htmlFor={ids.category}>Category</label>
          <select
            id={ids.category}
            className="hh-control"
            value={filters.category}
            onChange={(event) => setFilters({ ...filters, category: event.target.value })}
          >
            <option value="">All categories</option>
            {HERITAGE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="hh-field">
          <label htmlFor={ids.query}>Hotel or city name</label>
          <input
            id={ids.query}
            type="search"
            className="hh-control"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </div>

        <button type="button" className="hh-button" onClick={() => setFilters(NO_FILTERS)} disabled={!hasFilters}>
          Clear filters
        </button>
      </form>

      <p className="hh-count" aria-live="polite">
        {countText}
      </p>

      {groups.length === 0 ? (
        <div className="hh-empty">
          <p>No hotels match your filters.</p>
          <button type="button" className="hh-button" onClick={() => setFilters(NO_FILTERS)}>
            Reset filters
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.state} aria-labelledby={`hh-state-${slug(group.state)}`} className="hh-state">
            <h2 id={`hh-state-${slug(group.state)}`} className="hh-state__title">
              {group.state}
            </h2>
            <ul className="hh-grid">
              {group.hotels.map((hotel) => (
                <li key={`${hotel.name}-${hotel.city}`}>
                  <HotelCard hotel={hotel} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <aside className="hh-note" aria-label="Category definitions">
        <p className="hh-note__title">Category by year built</p>
        <ul>
          {CATEGORY_NOTES.map(({ category, note }) => (
            <li key={category}>
              <strong>{category}:</strong> {note}
            </li>
          ))}
        </ul>
      </aside>

      <p className="hh-footnote">
        Classification is voluntary and approvals expire. Please confirm with the hotel or the Ministry of Tourism before
        booking.
      </p>
    </div>
  );
}
