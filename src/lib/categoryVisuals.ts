/**
 * Deterministic category → visual mapping for AVENTA SHOP.
 *
 * One coherent visual system: monochrome Lucide line icons rendered on a
 * light AVENTA-blue tinted surface. Mapping is resolved from the category
 * slug first, then from keywords in the category name, so the same category
 * always renders the same icon (never random).
 */
import {
  Smartphone,
  Shirt,
  Sofa,
  Sparkles,
  ShoppingBasket,
  Footprints,
  Blocks,
  Dumbbell,
  Car,
  BookOpen,
  Headphones,
  Gamepad2,
  Baby,
  Watch,
  Tag,
  Heart,
  PawPrint,
  Laptop,
  Package,
  type LucideIcon,
} from "lucide-react";

/** Exact slug matches (highest priority). */
const SLUG_ICONS: Record<string, LucideIcon> = {
  electronics: Smartphone,
  "electronics-gadgets": Smartphone,
  computers: Laptop,
  "computers-laptops": Laptop,
  mobiles: Smartphone,
  "audio-accessories": Headphones,
  accessories: Headphones,
  gaming: Gamepad2,
  "gaming-tech": Gamepad2,
  fashion: Shirt,
  "fashion-apparel": Shirt,
  "fashion-lifestyle": Shirt,
  "mens-fashion": Shirt,
  "womens-fashion": Shirt,
  shoes: Footprints,
  footwear: Footprints,
  "shoes-footwear": Footprints,
  watches: Watch,
  "watches-jewelry": Watch,
  "home-living": Sofa,
  "home-lifestyle": Sofa,
  "home-kitchen": Sofa,
  furniture: Sofa,
  beauty: Sparkles,
  "health-beauty": Sparkles,
  "beauty-personal-care": Sparkles,
  health: Heart,
  groceries: ShoppingBasket,
  grocery: ShoppingBasket,
  "grocery-essentials": ShoppingBasket,
  "groceries-pets": ShoppingBasket,
  pets: PawPrint,
  toys: Blocks,
  "toys-kids": Blocks,
  "mother-baby": Baby,
  "baby-kids": Baby,
  sports: Dumbbell,
  "sports-fitness": Dumbbell,
  "sports-outdoor": Dumbbell,
  automotive: Car,
  "automotive-motorbike": Car,
  motors: Car,
  books: BookOpen,
  stationery: BookOpen,
  "books-stationery": BookOpen,
  offers: Tag,
  "special-offers": Tag,
};

/** Keyword fallbacks, evaluated in order against slug + name. */
const KEYWORD_ICONS: Array<[string, LucideIcon]> = [
  ["laptop", Laptop],
  ["computer", Laptop],
  ["gadget", Smartphone],
  ["mobile", Smartphone],
  ["phone", Smartphone],
  ["electronic", Smartphone],
  ["audio", Headphones],
  ["headphone", Headphones],
  ["earbud", Headphones],
  ["gaming", Gamepad2],
  ["game", Gamepad2],
  ["watch", Watch],
  ["jewel", Watch],
  ["shoe", Footprints],
  ["footwear", Footprints],
  ["sneaker", Footprints],
  ["fashion", Shirt],
  ["apparel", Shirt],
  ["clothing", Shirt],
  ["bag", Shirt],
  ["home", Sofa],
  ["living", Sofa],
  ["furniture", Sofa],
  ["kitchen", Sofa],
  ["decor", Sofa],
  ["beauty", Sparkles],
  ["cosmetic", Sparkles],
  ["skincare", Sparkles],
  ["perfume", Sparkles],
  ["personal care", Sparkles],
  ["health", Heart],
  ["grocery", ShoppingBasket],
  ["groceries", ShoppingBasket],
  ["food", ShoppingBasket],
  ["fresh", ShoppingBasket],
  ["essential", ShoppingBasket],
  ["pet", PawPrint],
  ["baby", Baby],
  ["mother", Baby],
  ["kid", Blocks],
  ["toy", Blocks],
  ["sport", Dumbbell],
  ["fitness", Dumbbell],
  ["outdoor", Dumbbell],
  ["auto", Car],
  ["motor", Car],
  ["car", Car],
  ["book", BookOpen],
  ["station", BookOpen],
  ["offer", Tag],
  ["deal", Tag],
];

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[&]/g, " ").replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve the icon for a category. Deterministic: same input → same icon.
 */
export function getCategoryIcon(category: {
  slug?: string | null;
  name?: string | null;
}): LucideIcon {
  const slug = category.slug ? slugify(category.slug) : "";
  if (slug && SLUG_ICONS[slug]) return SLUG_ICONS[slug];

  const nameSlug = category.name ? slugify(category.name) : "";
  if (nameSlug && SLUG_ICONS[nameSlug]) return SLUG_ICONS[nameSlug];

  const haystack = `${normalize(category.slug ?? "")} ${normalize(category.name ?? "")}`;
  for (const [keyword, icon] of KEYWORD_ICONS) {
    if (haystack.includes(keyword)) return icon;
  }
  return Package;
}
