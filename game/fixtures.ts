/**
 * Board fixtures for tests.
 *
 * Deliberately constructed boards whose scores we can reason about: a good one,
 * an awful one, and edge cases. Kept out of the test file so the scoring tests
 * and the director tests share the same definitions.
 */

import { CATALOG } from "./catalog";
import type { BoardSnapshot, PlacedItem } from "./snapshot";

export const BOARD_HALF_X = 1.1;
export const BOARD_HALF_Z = 0.79;
export const BOARD_TOP = 0.06;

let nextId = 1;

export function place(
  foodId: string,
  x: number,
  z: number,
  y = BOARD_TOP,
  overrides: Partial<PlacedItem> = {},
): PlacedItem {
  const food = CATALOG.find((f) => f.id === foodId);
  if (!food) throw new Error(`Unknown food in fixture: ${foodId}`);

  return {
    instanceId: nextId++,
    foodId: food.id,
    category: food.category,
    price: food.price,
    position: [x, y, z],
    radius: food.radius,
    color: food.color,
    fellOff: false,
    settled: true,
    ...overrides,
  };
}

export function boardOf(items: PlacedItem[]): BoardSnapshot {
  return {
    items,
    boardHalfX: BOARD_HALF_X,
    boardHalfZ: BOARD_HALF_Z,
    boardTop: BOARD_TOP,
    totalSpend: items.reduce((sum, i) => sum + i.price, 0),
    settled: true,
  };
}

/**
 * A genuinely good board: all five categories, classic pairings placed close
 * enough to count, spread across the board, varied colours, some height,
 * nothing on the floor.
 */
export function goodBoard(): BoardSnapshot {
  return boardOf([
    // Fig + blue, touching — the canonical pairing.
    place("figs", -0.55, -0.2),
    place("blue", -0.42, -0.14, BOARD_TOP + 0.05),

    // Prosciutto + grapes, also touching.
    place("prosciutto", 0.15, -0.28),
    place("grapes", 0.28, -0.22, BOARD_TOP + 0.05),
    place("grapes", 0.34, -0.3, BOARD_TOP + 0.11),

    // Honeycomb near the blue.
    place("honeycomb", -0.3, -0.02, BOARD_TOP + 0.03),

    // Almonds beside brie.
    place("brie", 0.62, 0.12, BOARD_TOP + 0.04),
    place("almonds", 0.5, 0.2),
    place("almonds", 0.56, 0.28),

    // Carbs, spread out.
    place("crackers", -0.75, 0.3),
    place("breadsticks", 0.05, 0.42),

    // Something acidic, kept well away from the honey.
    place("cornichons", 0.85, -0.4),
    place("soppressata", 0.78, -0.3, BOARD_TOP + 0.04),
  ]);
}

/**
 * A deliberately awful board: one category, all one colour, piled in a single
 * corner, flat, repetitive, with clashes touching and items on the floor.
 */
export function awfulBoard(): BoardSnapshot {
  const items: PlacedItem[] = [];

  // Nine salami rounds in a heap in one corner — past what a round that size
  // is allowed, and touching each other, so this trips both repetition and
  // clumping. Cheddar can no longer do that job: it is handful-sized now, and
  // handfuls are deliberately exempt from both.
  for (let i = 0; i < 9; i++) {
    items.push(place("salami", -0.9 + (i % 3) * 0.05, -0.6 + Math.floor(i / 3) * 0.05));
  }

  // Two cheddar cubes for the spend to be embarrassed about.
  items.push(place("cheddar", -0.78, -0.62));
  items.push(place("cheddar", -0.74, -0.58));

  // Clashes, touching.
  items.push(place("honeycomb", -0.85, -0.55));
  items.push(place("cornichons", -0.83, -0.52));

  // Three on the floor.
  for (let i = 0; i < 3; i++) {
    items.push(place("cheddar", 0, 0, -1, { fellOff: true }));
  }

  return boardOf(items);
}

/** Nothing placed at all. */
export function emptyBoard(): BoardSnapshot {
  return boardOf([]);
}

/** One lonely item. */
export function singleItemBoard(): BoardSnapshot {
  return boardOf([place("olives", 0, 0)]);
}
