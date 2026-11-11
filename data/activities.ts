/**
 * Kenya activities for Bueno Leisure: 14 categories and 98 activities. The records live in
 * `activity-categories.json` and `activities.json`; this file holds their types and lookups.
 */
import activitiesJson from "./activities.json";
import activityCategoriesJson from "./activity-categories.json";

export interface ActivityCategory {
  slug: string;
  name: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
  image: string;
}

export interface Activity {
  slug: string;
  name: string;
  /** Matches ActivityCategory.slug. */
  category: string;
  region: string;
  description: string;
  shortDescription: string;
  duration: string;
  bestSeason: string;
  peakMonths: string[];
  priceRange: { min: number; max: number; currency: string; unit: string };
  priceDisplay: string;
  difficulty: "Easy" | "Moderate" | "Challenging" | "Expert";
  targetClients: string[];
  operators: string[];
  image: string;
  highlights: string[];
  notes: string;
  placeholder: boolean;
}

export const activityCategories: ActivityCategory[] = activityCategoriesJson as ActivityCategory[];
export const activities: Activity[] = activitiesJson as Activity[];

export function getActivityBySlug(slug: string): Activity | undefined {
  return activities.find((activity) => activity.slug === slug);
}

export function getActivitiesByCategory(categorySlug: string): Activity[] {
  return activities.filter((activity) => activity.category === categorySlug);
}

export function getCategoryBySlug(slug: string): ActivityCategory | undefined {
  return activityCategories.find((category) => category.slug === slug);
}

export function searchActivities(query: string): Activity[] {
  const lowerQuery = query.toLowerCase();
  return activities.filter(
    (activity) =>
      activity.name.toLowerCase().includes(lowerQuery) ||
      activity.description.toLowerCase().includes(lowerQuery) ||
      activity.shortDescription.toLowerCase().includes(lowerQuery) ||
      activity.region.toLowerCase().includes(lowerQuery) ||
      activity.category.toLowerCase().includes(lowerQuery) ||
      activity.highlights.some((h) => h.toLowerCase().includes(lowerQuery)),
  );
}

export function getActivityPriceRange(category: string): { min: number; max: number } {
  const categoryActivities = getActivitiesByCategory(category);
  if (categoryActivities.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.min(...categoryActivities.map((a) => a.priceRange.min)),
    max: Math.max(...categoryActivities.map((a) => a.priceRange.max)),
  };
}
