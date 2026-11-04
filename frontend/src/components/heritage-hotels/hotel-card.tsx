"use client";

import { useEffect, useRef, useState } from "react";

import type { Hotel } from "@/lib/heritage-hotels";

function HotelImage({
  src,
  name,
  credit,
  sourceUrl,
}: {
  src: string;
  name: string;
  credit?: string;
  sourceUrl?: string;
}) {
  if (!src) {
    return (
      <div className="hh-media hh-media--empty">
        <span>Image to be added</span>
      </div>
    );
  }
  return (
    <div className="hh-media">
      <img src={src} alt={name} loading="lazy" decoding="async" className="hh-image" />
      {credit && sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hh-image-credit">
          {credit}
        </a>
      )}
    </div>
  );
}

export function HotelCard({ hotel }: { hotel: Hotel }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (detailsOpen && !dialog.open) dialog.showModal();
    if (!detailsOpen && dialog.open) dialog.close();
  }, [detailsOpen]);

  function openDetails() {
    setBooked(false);
    setDetailsOpen(true);
  }

  return (
    <article className="hh-card">
      <HotelImage src={hotel.image} name={hotel.name} credit={hotel.imageCredit} sourceUrl={hotel.imageSourceUrl} />
      <div className="hh-body">
        <span className={hotel.category ? "hh-badge" : "hh-badge hh-badge--muted"}>
          {hotel.category ?? "Category not verified"}
        </span>
        <h3 className="hh-card__name">{hotel.name}</h3>
        <p className="hh-meta">{hotel.city}</p>
        {hotel.builtYear !== null && <p className="hh-meta">Built in {hotel.builtYear}</p>}
        {hotel.about && <p className="hh-about">{hotel.about}</p>}
        {hotel.rooms !== null && <p className="hh-meta">{hotel.rooms} rooms</p>}
        {hotel.phone && (
          <p className="hh-meta">
            <a href={`tel:${hotel.phone}`} className="hh-inline-link">
              {hotel.phone}
            </a>
          </p>
        )}
        {hotel.email && (
          <p className="hh-meta">
            <a href={`mailto:${hotel.email}`} className="hh-inline-link">
              {hotel.email}
            </a>
          </p>
        )}
        <button type="button" className="hh-link hh-card-cta" onClick={openDetails}>
          View stay details<span className="sr-only"> for {hotel.name}</span>
        </button>
        {hotel.detailUrl && (
          <a href={hotel.detailUrl} target="_blank" rel="noopener noreferrer" className="hh-inline-link">
            Official hotel details
          </a>
        )}
      </div>
      <dialog
        ref={dialogRef}
        className="hh-dialog"
        aria-labelledby={`hh-dialog-title-${hotel.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
        onClose={() => {
          setDetailsOpen(false);
          setBooked(false);
        }}
      >
        <div className="hh-dialog__header">
          <div>
            <p className="hh-dialog__eyebrow">Sample stay · 1 night</p>
            <h2 id={`hh-dialog-title-${hotel.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
              {hotel.name}
            </h2>
          </div>
          <button type="button" className="hh-dialog__close" onClick={() => setDetailsOpen(false)} aria-label="Close stay details">
            ×
          </button>
        </div>
        <p className="hh-dialog__price">
          ₹14,999 <span>INR per night · illustrative demo price</span>
        </p>
        <ul className="hh-dialog__list">
          <li>Stay for two guests</li>
          <li>Breakfast for two included</li>
          <li>Wi-Fi included</li>
          <li>Check-out: 11:00 AM (sample timing)</li>
        </ul>
        <p className="hh-dialog__disclaimer">
          Sample package only. Price, availability, inclusions, and timings are not confirmed with the hotel.
        </p>
        {booked ? (
          <p className="hh-booking-confirmation" role="status">
            Hotel booked (demo) for two. No payment was processed and no reservation was sent to the hotel.
          </p>
        ) : (
          <button type="button" className="hh-book-button" onClick={() => setBooked(true)}>
            Book this stay
          </button>
        )}
      </dialog>
    </article>
  );
}
