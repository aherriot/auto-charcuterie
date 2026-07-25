/**
 * Food scoring — Bartholomew's axis.
 *
 * Pairings, category balance, restraint, and value. Like the aesthetic scorer
 * this is pure data in, numbers out, and every finding carries the note that
 * justifies it so the verdict can be specific rather than generic.
 */

import {
  CATALOG,
  CATEGORY_ORDER,
  repetitionLimit,
  type Category,
} from "../catalog";
import { onBoard, type BoardSnapshot, type PlacedItem } from "../snapshot";
import { pairingFor, PAIRING_RADIUS, type Pairing } from "./pairings";

export interface FoodFinding {
  kind: "pairing" | "clash" | "balance" | "repetition" | "value";
  /** Signed contribution to the raw total. */
  points: number;
  note: string;
}

export interface FoodResult {
  /** 0–100. */
  score: number;
  findings: FoodFinding[];
  /** Best thing on the board, if anything qualifies. */
  bestPairing: FoodFinding | null;
  /** Worst offence, which is what Bartholomew will lead with. */
  worstOffence: FoodFinding | null;
  categoriesPresent: Category[];
  missingCategories: Category[];
}

const CATEGORY_LABEL: Record<Category, string> = {
  meat: "charcuterie",
  cheese: "cheese",
  produce: "fruit or pickles",
  nut: "nuts or olives",
  carb: "something to put it on",
};

export function scoreFood(snapshot: BoardSnapshot): FoodResult {
  const items = onBoard(snapshot);
  const findings: FoodFinding[] = [];

  if (items.length === 0) {
    return {
      score: 0,
      findings: [],
      bestPairing: null,
      worstOffence: null,
      categoriesPresent: [],
      missingCategories: [...CATEGORY_ORDER],
    };
  }

  collectPairings(items, findings);
  const { present, missing } = collectBalance(items, findings);
  collectRepetition(items, findings);
  collectValue(snapshot, items, findings);

  const raw = findings.reduce((sum, f) => sum + f.points, 0);

  // Map the signed raw total onto 0–100. The midpoint sits at zero — a board
  // with no opinions either way lands mid-table, and you have to actually earn
  // your way up or down from there.
  const score = clamp(50 + raw * 3.2, 0, 100);

  const pairings = findings.filter((f) => f.kind === "pairing");
  const offences = findings.filter((f) => f.points < 0);

  return {
    score,
    findings,
    bestPairing: pairings.reduce<FoodFinding | null>(
      (best, f) => (!best || f.points > best.points ? f : best),
      null,
    ),
    worstOffence: offences.reduce<FoodFinding | null>(
      (worst, f) => (!worst || f.points < worst.points ? f : worst),
      null,
    ),
    categoriesPresent: present,
    missingCategories: missing,
  };
}

/**
 * Pairings, gated on proximity.
 *
 * Each *food pair* scores at most once no matter how many instances qualify —
 * otherwise six olives beside one fig would read as six separate triumphs, and
 * spamming a single item would be the dominant strategy.
 */
function collectPairings(items: PlacedItem[], findings: FoodFinding[]) {
  const seen = new Map<string, { pairing: Pairing; distance: number }>();

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.foodId === b.foodId) continue;

      const pairing = pairingFor(a.foodId, b.foodId);
      if (!pairing) continue;

      const distance = Math.hypot(
        a.position[0] - b.position[0],
        a.position[2] - b.position[2],
      );
      if (distance > PAIRING_RADIUS) continue;

      const k = pairing.a < pairing.b ? `${pairing.a}|${pairing.b}` : `${pairing.b}|${pairing.a}`;
      const existing = seen.get(k);
      if (!existing || distance < existing.distance) {
        seen.set(k, { pairing, distance });
      }
    }
  }

  for (const { pairing } of seen.values()) {
    findings.push({
      kind: pairing.score >= 0 ? "pairing" : "clash",
      points: pairing.score,
      note: pairing.note,
    });
  }
}

/** Hitting all five groups is the baseline competence test. */
function collectBalance(
  items: PlacedItem[],
  findings: FoodFinding[],
): { present: Category[]; missing: Category[] } {
  const present = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  const missing = CATEGORY_ORDER.filter((c) => !present.includes(c));

  findings.push({
    kind: "balance",
    points: present.length * 1.4 - missing.length * 0.9,
    note:
      missing.length === 0
        ? "all five groups represented"
        : `no ${missing.map((c) => CATEGORY_LABEL[c]).join(", no ")}`,
  });

  return { present, missing };
}

/**
 * Restraint.
 *
 * The first several of anything are fine. Past that it stops being a choice and
 * starts being a habit, and the penalty grows superlinearly.
 *
 * How many counts as "several" depends on the size of the thing — see
 * `repetitionLimit`. Scattering fourteen almonds is what almonds are for.
 */
function collectRepetition(items: PlacedItem[], findings: FoodFinding[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.foodId, (counts.get(item.foodId) ?? 0) + 1);
  }

  for (const [foodId, count] of counts) {
    const food = CATALOG.find((f) => f.id === foodId);
    if (!food) continue;

    const limit = repetitionLimit(food);
    if (count <= limit) continue;

    // Measured as a fraction of the limit, so overshooting by half again is
    // the same lapse whether that is seven almonds past fourteen or two
    // wedges past four. An absolute excess would make the small items, which
    // are placed in handfuls, impossible to use.
    const over = (count - limit) / limit;
    findings.push({
      kind: "repetition",
      points: -(over ** 1.4) * 5.5,
      note: `${count} × ${food.shortName} is not a decision, it is a habit`,
    });
  }
}

/**
 * Value for money.
 *
 * Compares what was spent against the average quality of what was bought.
 * Spending heavily on good things is fine; spending heavily on cheddar is not,
 * and spending nothing at all is its own kind of statement.
 */
function collectValue(
  snapshot: BoardSnapshot,
  items: PlacedItem[],
  findings: FoodFinding[],
) {
  const spend = snapshot.totalSpend;
  if (spend <= 0) return;

  const quality =
    items.reduce((sum, i) => {
      const food = CATALOG.find((f) => f.id === i.foodId);
      return sum + (food?.quality ?? 0.5);
    }, 0) / items.length;

  // Quality is 0–1; 0.5 is the neutral point.
  const points = (quality - 0.5) * 6;

  findings.push({
    kind: "value",
    points,
    note:
      quality > 0.72
        ? `$${spend.toFixed(2)} spent, and spent well`
        : quality < 0.38
          ? `$${spend.toFixed(2)} on that selection`
          : `$${spend.toFixed(2)}, unremarkably allocated`,
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
