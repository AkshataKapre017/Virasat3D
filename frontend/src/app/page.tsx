import { AtlasExplorer } from "@/components/atlas/explorer";
import { HeritageHero } from "@/components/home/heritage-hero";

export default function AtlasPage() {
  return (
    <>
      <HeritageHero />
      <div id="atlas">
        <AtlasExplorer />
      </div>
    </>
  );
}
