"use client";

import { useId, useState } from "react";

import data from "@/data/rent-a-car.json";

export interface RentACarRow {
  sr: number;
  vehicle: string;
  rate: number;
  extraKmRate: number;
}

export interface RentACarSection {
  id: string;
  title: string;
  rateLabel: string;
  rows: RentACarRow[];
  terms: string[];
}

export interface RentACarCategory {
  id: string;
  label: string;
  sections: RentACarSection[];
}

export interface RentACarConfig {
  title: string;
  categories: RentACarCategory[];
}

const config: RentACarConfig = data;

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function RentACarTable({ section }: { section: RentACarSection }) {
  return (
    <section aria-labelledby={`${section.id}-heading`} className="space-y-4">
      <h2 id={`${section.id}-heading`} className="font-serif text-2xl font-semibold">
        {section.title}
      </h2>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-sandstone/20 bg-black/5 text-xs tracking-wide uppercase text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Sr
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Vehicle details
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {section.rateLabel}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Extra KM rate
              </th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.sr} className="border-b border-sandstone/20 last:border-b-0">
                <td className="px-4 py-3 tabular-nums">{row.sr}</td>
                <td className="px-4 py-3">{row.vehicle}</td>
                <td className="px-4 py-3 text-right tabular-nums">{rupees.format(row.rate)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{rupees.format(row.extraKmRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {section.terms.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Terms &amp; Conditions</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
            {section.terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export function RentACar() {
  const selectId = useId();
  const [categoryId, setCategoryId] = useState(config.categories[0].id);
  const category = config.categories.find((c) => c.id === categoryId) ?? config.categories[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <label htmlFor={selectId} className="font-semibold">
          Select Category
        </label>
        <select
          id={selectId}
          value={category.id}
          onChange={(event) => setCategoryId(event.target.value)}
          className="card w-full px-3 py-2 sm:w-72"
        >
          {config.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {category.sections.map((section) => (
        <RentACarTable key={section.id} section={section} />
      ))}
    </div>
  );
}
