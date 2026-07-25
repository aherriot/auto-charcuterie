/**
 * The food catalogue — sixteen items across five categories.
 *
 * **This file must not import from `engine/`.** Scoring and judge dialogue run
 * over this data in Node with no GPU, which is what makes the pairing matrix and
 * comedy timing fast to iterate on. Meshes and materials are referenced by id;
 * `engine/mesh/foods.ts` maps ids to generators.
 *
 * Sixteen is deliberate: enough for category balance and the pairing matrix to
 * carry real signal, few enough that every item gets hand-tuned geometry.
 */

export type Category = "meat" | "cheese" | "produce" | "nut" | "carb";

/** Mesh generators, resolved in engine/mesh/foods.ts. */
export type MeshId =
  | "slice"
  | "salamiRound"
  | "soppressataRound"
  | "brieWedge"
  | "goudaBlock"
  | "blueWedge"
  | "cheddarCube"
  | "grape"
  | "figHalf"
  | "cornichon"
  | "olive"
  | "almond"
  | "cashew"
  | "cracker"
  | "breadstick"
  | "honeycomb";

/** Must match MAT in engine/shaders/materials.ts. */
export const MaterialId = {
  PLAIN: 0,
  WOOD: 1,
  CURED_MEAT: 2,
  CHEESE_EYED: 3,
  CHEESE_BLUE: 4,
  CHEESE_RIND: 5,
  CHEESE_HARD: 6,
  OLIVE: 7,
  NUT: 8,
  CRACKER: 9,
  BREAD: 10,
  GRAPE: 11,
  FIG: 12,
  HONEYCOMB: 13,
  PICKLE: 14,
  NUT_SKIN: 15,
} as const;

export interface Food {
  id: string;
  name: string;
  /** Shown on the tasting-menu tray. */
  shortName: string;
  category: Category;
  /**
   * US dollars, per single placed piece — one slice, one grape, one cashew.
   * Tuned so obviously-fancy items cost enough to be worth roasting.
   */
  price: number;
  /** Representative linear RGB, used by the aesthetics scorer for colour analysis. */
  color: [number, number, number];
  mesh: MeshId;
  materialId: number;
  baseRoughness: number;
  /**
   * Cloth items are simulated as XPBD slices; rigid items get a Rapier body.
   * Only the thin cured meats drape.
   */
  simulation: "cloth" | "rigid";
  /** Approximate bounding radius in world units, for scoring and layout. */
  radius: number;
  /** How aggressively the judges consider this a "luxury" pick. 0–1. */
  quality: number;
}

export const CATALOG: Food[] = [
  // --- meats ---------------------------------------------------------------
  {
    id: "prosciutto",
    name: "Prosciutto di Parma",
    shortName: "Prosciutto",
    category: "meat",
    price: 1.2,
    color: [0.74, 0.36, 0.36],
    mesh: "slice",
    materialId: MaterialId.CURED_MEAT,
    baseRoughness: 0.52,
    simulation: "cloth",
    radius: 0.22,
    quality: 0.95,
  },
  {
    id: "soppressata",
    name: "Soppressata",
    shortName: "Soppressata",
    category: "meat",
    price: 0.45,
    color: [0.58, 0.19, 0.19],
    mesh: "soppressataRound",
    materialId: MaterialId.CURED_MEAT,
    baseRoughness: 0.48,
    simulation: "rigid",
    radius: 0.13,
    quality: 0.72,
  },
  {
    id: "salami",
    name: "Salami",
    shortName: "Salami",
    category: "meat",
    price: 0.25,
    color: [0.62, 0.24, 0.22],
    mesh: "salamiRound",
    materialId: MaterialId.CURED_MEAT,
    baseRoughness: 0.5,
    simulation: "rigid",
    radius: 0.12,
    quality: 0.4,
  },

  // --- cheeses -------------------------------------------------------------
  {
    id: "brie",
    name: "Brie de Meaux",
    shortName: "Brie",
    category: "cheese",
    price: 1.6,
    color: [0.95, 0.88, 0.66],
    mesh: "brieWedge",
    materialId: MaterialId.CHEESE_RIND,
    baseRoughness: 0.55,
    simulation: "rigid",
    radius: 0.2,
    quality: 0.85,
  },
  {
    id: "gouda",
    name: "Aged Gouda",
    shortName: "Gouda",
    category: "cheese",
    price: 1.1,
    color: [0.85, 0.66, 0.31],
    mesh: "goudaBlock",
    materialId: MaterialId.CHEESE_EYED,
    baseRoughness: 0.45,
    simulation: "rigid",
    radius: 0.17,
    quality: 0.8,
  },
  {
    id: "blue",
    name: "Stilton",
    shortName: "Blue",
    category: "cheese",
    price: 1.35,
    color: [0.9, 0.88, 0.76],
    mesh: "blueWedge",
    materialId: MaterialId.CHEESE_BLUE,
    baseRoughness: 0.6,
    simulation: "rigid",
    radius: 0.19,
    quality: 0.82,
  },
  {
    id: "cheddar",
    name: "Supermarket Cheddar",
    shortName: "Cheddar",
    category: "cheese",
    // A 40%-narrower cube is a shade over a fifth of the volume it was, and
    // the price follows the cheese rather than the piece.
    price: 0.05,
    color: [0.72, 0.34, 0.07],
    mesh: "cheddarCube",
    materialId: MaterialId.CHEESE_HARD,
    baseRoughness: 0.5,
    simulation: "rigid",
    radius: 0.06,
    quality: 0.15,
  },

  // --- produce -------------------------------------------------------------
  {
    id: "grapes",
    name: "Black Muscat Grapes",
    shortName: "Grapes",
    category: "produce",
    price: 0.1,
    color: [0.19, 0.08, 0.22],
    mesh: "grape",
    materialId: MaterialId.GRAPE,
    baseRoughness: 0.34,
    simulation: "rigid",
    radius: 0.055,
    quality: 0.6,
  },
  {
    id: "figs",
    name: "Black Mission Figs",
    shortName: "Figs",
    category: "produce",
    price: 0.9,
    color: [0.35, 0.19, 0.3],
    mesh: "figHalf",
    materialId: MaterialId.FIG,
    baseRoughness: 0.42,
    simulation: "rigid",
    radius: 0.085,
    quality: 0.88,
  },
  {
    id: "cornichons",
    name: "Cornichons",
    shortName: "Cornichons",
    category: "produce",
    price: 0.25,
    color: [0.17, 0.29, 0.09],
    mesh: "cornichon",
    materialId: MaterialId.PICKLE,
    baseRoughness: 0.3,
    simulation: "rigid",
    radius: 0.105,
    quality: 0.55,
  },

  // --- nuts & olives -------------------------------------------------------
  {
    id: "olives",
    name: "Castelvetrano Olives",
    shortName: "Olives",
    category: "nut",
    price: 0.3,
    color: [0.44, 0.53, 0.16],
    mesh: "olive",
    materialId: MaterialId.OLIVE,
    baseRoughness: 0.24,
    simulation: "rigid",
    radius: 0.058,
    quality: 0.7,
  },
  {
    id: "almonds",
    name: "Marcona Almonds",
    shortName: "Almonds",
    category: "nut",
    price: 0.15,
    color: [0.68, 0.47, 0.27],
    mesh: "almond",
    materialId: MaterialId.NUT_SKIN,
    baseRoughness: 0.82,
    simulation: "rigid",
    radius: 0.055,
    quality: 0.78,
  },
  {
    id: "cashews",
    name: "Cashews",
    shortName: "Cashews",
    category: "nut",
    price: 0.12,
    color: [0.70, 0.55, 0.34],
    mesh: "cashew",
    materialId: MaterialId.NUT,
    baseRoughness: 0.42,
    simulation: "rigid",
    radius: 0.05,
    quality: 0.45,
  },

  // --- carbs & extras ------------------------------------------------------
  {
    id: "crackers",
    name: "Water Crackers",
    shortName: "Crackers",
    category: "carb",
    price: 0.1,
    color: [0.80, 0.66, 0.44],
    mesh: "cracker",
    materialId: MaterialId.CRACKER,
    baseRoughness: 0.82,
    simulation: "rigid",
    radius: 0.095,
    quality: 0.3,
  },
  {
    id: "breadsticks",
    name: "Grissini",
    shortName: "Grissini",
    category: "carb",
    price: 0.35,
    color: [0.79, 0.63, 0.38],
    mesh: "breadstick",
    materialId: MaterialId.BREAD,
    baseRoughness: 0.68,
    simulation: "rigid",
    radius: 0.3,
    quality: 0.5,
  },
  {
    id: "honeycomb",
    name: "Raw Honeycomb",
    shortName: "Honeycomb",
    category: "carb",
    price: 1.25,
    color: [0.93, 0.71, 0.26],
    mesh: "honeycomb",
    materialId: MaterialId.HONEYCOMB,
    baseRoughness: 0.35,
    simulation: "rigid",
    radius: 0.15,
    quality: 0.9,
  },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  meat: "Charcuterie",
  cheese: "Fromage",
  produce: "Fruits & pickles",
  nut: "Nuts & olives",
  carb: "Breads & sweets",
};

export const CATEGORY_ORDER: Category[] = ["meat", "cheese", "produce", "nut", "carb"];

/**
 * The radius below which a food is something you serve by the handful.
 *
 * Olives, nuts, grapes and cheddar cubes are scattered, not placed, so neither
 * the repetition limit nor the aesthetic clumping penalty should treat a pile
 * of them as a lapse. Sits just above the largest of them and well below the
 * cornichon, which is the smallest thing you'd still lay out one at a time.
 */
export const HANDFUL_RADIUS = 0.07;

/**
 * How many of one food still read as a selection rather than a pile.
 *
 * Scaled by size, because "too many" is a question of how much board the
 * repetition eats, not how many times you tapped. Twenty olives is a bowl's
 * worth tipped out; a dozen brie wedges is a cheese course that has gone wrong.
 *
 * The 1.5 exponent sits between the two obvious laws. A pure inverse can't
 * separate them enough — pushing the handful items to twenty drags grissini up
 * with them — and an area law runs the other way, making the small items so
 * permissive (two hundred almonds) that the limit stops meaning anything. The
 * constant is set so everything under `HANDFUL_RADIUS` reaches twenty.
 *
 * Yields: grapes, olives, nuts and cheddar 19–20, figs 11, crackers 10,
 * cornichons 8, salami 7, soppressata 6, honeycomb 5, and 4 for everything
 * from gouda up.
 */
export function repetitionLimit(food: Food): number {
  return Math.min(20, Math.max(4, Math.round(0.28 / food.radius ** 1.5)));
}

export function foodById(id: string): Food | undefined {
  return CATALOG.find((f) => f.id === id);
}

export function foodsByCategory(category: Category): Food[] {
  return CATALOG.filter((f) => f.category === category);
}
