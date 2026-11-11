/**
 * Website content for Bueno Leisure: tour packages, destinations and the blog.
 * The records live in the JSON files beside this module; this file holds their types and the
 * lookups the back office uses. Edit the JSON to change content.
 */
import blogCategoriesJson from "./blog-categories.json";
import blogPostsJson from "./blog-posts.json";
import destinationsJson from "./destinations.json";
import tourPackagesJson from "./tour-packages.json";

// ─── Tour Packages ───

export type TourCategory = "safari" | "beach" | "city" | "romantic" | "adventure" | "weekend" | "honeymoon" | "train";

export interface TourPackage {
  slug: string;
  title: string;
  location: string;
  duration: string;
  /** Current "From" price in whole US dollars; used until the back office sets prices. */
  listPriceUsd: number;
  description: string;
  shortDescription: string;
  image: string;
  gallery: string[];
  highlights: string[];
  included: string[];
  notIncluded: string[];
  itinerary: { day: string; title: string; description: string }[];
  destinations: string[];
  category: TourCategory;
}

export const tourPackages: TourPackage[] = tourPackagesJson as TourPackage[];

// ─── Destinations ───

export interface Destination {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  shortDescription: string;
  image: string;
  gallery: string[];
  highlights: string[];
  bestTimeToVisit: string;
  averageTemp: string;
}

export const destinations: Destination[] = destinationsJson as Destination[];

// ─── Blog ───

export interface BlogPost {
  slug: string;
  title: string;
  /** Standfirst. Rendered as the italic lede above the body, and the default meta description. */
  excerpt: string;
  /** Full article in markdown: `##` headings, paragraphs, `-` lists, `**bold**`, `[label](href)`. */
  body: string;
  image: string;
  imageAlt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  /** SEO overrides. Fall back to `title` / `excerpt` when omitted. */
  metaTitle?: string;
  metaDescription?: string;
  /** Target keyword for this post. Editorial reference only, never rendered. */
  primaryKeyword?: string;
}

export const blogPosts: BlogPost[] = blogPostsJson as BlogPost[];

export interface BlogCategory {
  slug: string;
  name: string;
  description: string;
}

export const blogCategories: BlogCategory[] = blogCategoriesJson as BlogCategory[];

// ─── Lookups ───

export function getTourBySlug(slug: string): TourPackage | undefined {
  return tourPackages.find((t) => t.slug === slug);
}

export function getDestinationBySlug(slug: string): Destination | undefined {
  return destinations.find((d) => d.slug === slug);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getCategoryBySlug(slug: string): BlogCategory | undefined {
  return blogCategories.find((c) => c.slug === slug);
}

export function getPostsByCategory(categorySlug: string): BlogPost[] {
  const category = getCategoryBySlug(categorySlug);
  if (!category) return [];
  return blogPosts.filter((p) => p.category === category.name);
}

export function getToursByDestination(destinationSlug: string): TourPackage[] {
  return tourPackages.filter((t) => t.destinations.includes(destinationSlug));
}

export function getToursByCategory(category: TourCategory): TourPackage[] {
  return tourPackages.filter((t) => t.category === category);
}

/**
 * Leading day count from a `duration` string such as "7 Days".
 * Returns Infinity for anything unparseable so it sorts last rather than
 * landing at the front as a 0.
 */
export function getDurationDays(tour: TourPackage): number {
  const match = /(\d+)/.exec(tour.duration);
  if (!match?.[1]) return Number.POSITIVE_INFINITY;
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) ? days : Number.POSITIVE_INFINITY;
}

// ─── All-Inclusive Status ───
//
// Coast hotels are run as all-inclusive resorts; safari lodges are not.
// A package's "all-inclusive" status is derived from whether its
// destinations are coastal. "full" means every destination is coastal,
// "coast-only" means the trip mixes safari + coast (coast portion is AI),
// "none" means there is no coastal leg.

const COAST_DESTINATION_SLUGS = new Set(["diani-beach", "watamu", "lamu", "mombasa"]);

export type AllInclusiveLevel = "full" | "coast-only" | "none";

export function getAllInclusiveLevel(tour: TourPackage): AllInclusiveLevel {
  const coastCount = tour.destinations.filter((d) => COAST_DESTINATION_SLUGS.has(d)).length;
  if (coastCount === 0) return "none";
  if (coastCount === tour.destinations.length) return "full";
  return "coast-only";
}

export function getAllInclusiveBadgeText(level: AllInclusiveLevel): string | null {
  if (level === "full") return "ALL-INCLUSIVE";
  if (level === "coast-only") return "ALL-INCLUSIVE ON THE COAST";
  return null;
}
