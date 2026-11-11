/**
 * Services, retreats, add-ons and concierge offerings. The records live in the JSON files
 * beside this module; this file holds their types and the derived lists.
 */
import buenoPhilosophyJson from "./bueno-philosophy.json";
import conciergeServicesJson from "./concierge-services.json";
import serviceCategoriesJson from "./service-categories.json";
import travelAddOnsJson from "./travel-add-ons.json";
import wellnessRetreatsJson from "./wellness-retreats.json";

export interface ServiceCategory {
  id: string;
  title: string;
  services: Service[];
}

export interface Service {
  slug: string;
  title: string;
  description: string;
  image: string;
  category: string;
  featured?: boolean;
  /** If set, links to a dedicated detail page instead of generic. */
  detailHref?: string;
}

export interface WellnessRetreat {
  slug: string;
  title: string;
  tagline: string;
  audience: string;
  heroImage: string;
  description: string;
  highlights: string[];
  image: string;
}

export interface TravelAddOn {
  id: string;
  title: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
  tier: "complimentary" | "add-on";
}

export interface ConciergeService {
  id: string;
  title: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
}

export interface PhilosophyLetter {
  letter: string;
  title: string;
  description: string;
}

export const wellnessRetreats: WellnessRetreat[] = wellnessRetreatsJson as WellnessRetreat[];
export const serviceCategories: ServiceCategory[] = serviceCategoriesJson as ServiceCategory[];
export const travelAddOns: TravelAddOn[] = travelAddOnsJson as TravelAddOn[];
export const conciergeServices: ConciergeService[] = conciergeServicesJson as ConciergeService[];
export const buenoPhilosophy: PhilosophyLetter[] = buenoPhilosophyJson as PhilosophyLetter[];

export const allServices: Service[] = serviceCategories.flatMap((cat) => cat.services);

/** Featured services for the homepage showcase. */
export const featuredServices: Service[] = allServices.filter((s) => s.featured);
