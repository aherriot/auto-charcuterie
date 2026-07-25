/**
 * The one contract between `engine/` and `game/`.
 *
 * Scoring and judge dialogue consume this and nothing else — no GPU types, no
 * Rapier types, no React. That's what lets the entire judging system run under
 * `node --test` in milliseconds, which matters because scoring weights and
 * comedy timing are the things we iterate on most.
 *
 * Produced by `engine/boardState.ts`, consumed by `game/scoring/` in Phase 5.
 */

import type { Category } from "./catalog";

export interface PlacedItem {
  /** Unique per placement, not per food — six olives are six items. */
  instanceId: number;
  foodId: string;
  category: Category;
  price: number;
  /** World position of the item's centre. */
  position: [number, number, number];
  /** Approximate bounding radius, for overlap and clustering maths. */
  radius: number;
  /** Representative linear RGB, for the aesthetics scorer's colour analysis. */
  color: [number, number, number];
  /** True once the item has left the board. Kai has opinions about this. */
  fellOff: boolean;
  /** Physics has come to rest. Scoring should wait for this. */
  settled: boolean;
}

export interface BoardSnapshot {
  items: PlacedItem[];
  /** Half-extents of the board's top surface, so coverage can be normalised. */
  boardHalfX: number;
  boardHalfZ: number;
  boardTop: number;
  totalSpend: number;
  /** True when nothing is still moving — the board is ready to be judged. */
  settled: boolean;
}

/** Items still on the board. Most scoring should use this, not `items`. */
export function onBoard(snapshot: BoardSnapshot): PlacedItem[] {
  return snapshot.items.filter((i) => !i.fellOff);
}

export function spendOf(snapshot: BoardSnapshot): number {
  return snapshot.items.reduce((sum, i) => sum + i.price, 0);
}

/** Horizontal distance between two items, ignoring height. */
export function planarDistance(a: PlacedItem, b: PlacedItem): number {
  return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
}
