import type { Metadata } from "next";

import { HeritageHotels } from "@/components/heritage-hotels/heritage-hotels";
import data from "@/data/heritage-hotels.json";
import type { HeritageHotelsData } from "@/lib/heritage-hotels";

import "./heritage-hotels.css";

export const metadata: Metadata = {
  title: "Heritage Hotels across India",
  description: "Forts, palaces and havelis converted into hotels, listed by state.",
};

const hotelsData: HeritageHotelsData = data;

export default function HeritageHotelsPage() {
  return (
    <>
      <div className="hh-banner">
        {hotelsData.banner.image ? (
          <img src={hotelsData.banner.image} alt={hotelsData.banner.alt} className="hh-banner__img" />
        ) : (
          <div className="hh-banner__placeholder" aria-hidden="true" />
        )}
        <p className="hh-banner__title">Stay where history lives.</p>
      </div>
      <HeritageHotels data={hotelsData} />
    </>
  );
}
