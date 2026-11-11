import { tourPackages } from "@/data/cms";

export const KNOWN_TOUR_SLUGS: ReadonlySet<string> = new Set(tourPackages.map((tour) => tour.slug));

export function tourTitleOf(slug: string): string {
  return tourPackages.find((tour) => tour.slug === slug)?.title ?? slug;
}
