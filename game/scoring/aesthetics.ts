/**
 * Aesthetic scoring — Kai's axis.
 *
 * Pure geometry over a `BoardSnapshot`: positions, radii and colours. No GPU,
 * no rendering, no engine types, so the whole thing runs under `node --test`.
 *
 * Every component returns 0–1 so weights are directly comparable, and each
 * carries a `detail` string that commentary and the verdict quote back — a
 * score with no explanation is neither useful nor funny.
 */

import { HANDFUL_RADIUS } from "../catalog";
import { onBoard, type BoardSnapshot, type PlacedItem } from "../snapshot";

export interface Component {
  key: string;
  label: string;
  /** Normalised 0–1, before weighting. */
  value: number;
  weight: number;
  /** Human-readable observation, in neutral voice — Kai adds the attitude. */
  detail: string;
}

export interface AestheticResult {
  /** 0–100. */
  score: number;
  components: Component[];
  /** Worst-performing component, which is what Kai will lead with. */
  weakest: Component | null;
  /** Best-performing component, for grudging credit. */
  strongest: Component | null;
}

/**
 * Weights. Positive contributions are rewards, negatives are penalties applied
 * against their own 0–1 measure.
 */
const WEIGHTS = {
  coverage: 1.6,
  colourVariance: 1.5,
  spatialEntropy: 1.2,
  heightVariation: 0.9,
  clustering: -1.3,
  edgeCrowding: -0.8,
  fellOff: -1.5,
} as const;

/** Occupancy grid resolution across the board's long axis. */
const GRID_X = 26;
const GRID_Z = 18;

export function scoreAesthetics(snapshot: BoardSnapshot): AestheticResult {
  const items = onBoard(snapshot);

  if (items.length === 0) {
    return {
      score: 0,
      components: [],
      weakest: null,
      strongest: null,
      // An empty board is not a composition, and Kai will say so.
    };
  }

  const components: Component[] = [
    coverage(snapshot, items),
    colourVariance(items),
    spatialEntropy(snapshot, items),
    heightVariation(snapshot, items),
    clustering(items),
    edgeCrowding(snapshot, items),
    fellOff(snapshot),
  ];

  // Rewards accumulate toward their weight; penalties subtract from it.
  let earned = 0;
  let available = 0;
  for (const c of components) {
    if (c.weight > 0) {
      available += c.weight;
      earned += c.value * c.weight;
    } else {
      earned += c.value * c.weight;
    }
  }

  const score = clamp01(earned / available) * 100;

  const rewards = components.filter((c) => c.weight > 0);
  const penalties = components.filter((c) => c.weight < 0);

  // "Weakest" means most damaging: either a reward not earned or a penalty
  // incurred, whichever costs more.
  const worstReward = rewards.reduce<Component | null>(
    (worst, c) => (!worst || c.value < worst.value ? c : worst),
    null,
  );
  const worstPenalty = penalties.reduce<Component | null>(
    (worst, c) => (!worst || c.value > worst.value ? c : worst),
    null,
  );

  const weakest =
    worstPenalty && worstPenalty.value > 0.45
      ? worstPenalty
      : worstReward;

  const strongest = rewards.reduce<Component | null>(
    (best, c) => (!best || c.value > best.value ? c : best),
    null,
  );

  return { score, components, weakest, strongest };
}

// --- components ------------------------------------------------------------

/**
 * How much of the board is used.
 *
 * Scored as a peak rather than "more is better": a bare board is sad, but a
 * board buried under food is not a composition either. The sweet spot sits a
 * little over half.
 */
function coverage(snapshot: BoardSnapshot, items: PlacedItem[]): Component {
  const cells = new Uint8Array(GRID_X * GRID_Z);
  const spanX = snapshot.boardHalfX * 2;
  const spanZ = snapshot.boardHalfZ * 2;

  for (const item of items) {
    const [x, , z] = item.position;
    const r = item.radius;

    const minX = Math.max(0, Math.floor(((x - r + snapshot.boardHalfX) / spanX) * GRID_X));
    const maxX = Math.min(GRID_X - 1, Math.ceil(((x + r + snapshot.boardHalfX) / spanX) * GRID_X));
    const minZ = Math.max(0, Math.floor(((z - r + snapshot.boardHalfZ) / spanZ) * GRID_Z));
    const maxZ = Math.min(GRID_Z - 1, Math.ceil(((z + r + snapshot.boardHalfZ) / spanZ) * GRID_Z));

    for (let gz = minZ; gz <= maxZ; gz++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const cx = ((gx + 0.5) / GRID_X) * spanX - snapshot.boardHalfX;
        const cz = ((gz + 0.5) / GRID_Z) * spanZ - snapshot.boardHalfZ;
        if (Math.hypot(cx - x, cz - z) <= r) cells[gz * GRID_X + gx] = 1;
      }
    }
  }

  let filled = 0;
  for (const c of cells) filled += c;
  const ratio = filled / cells.length;

  const ideal = 0.58;
  const value = clamp01(1 - Math.abs(ratio - ideal) / ideal);

  return {
    key: "coverage",
    label: "Coverage",
    value,
    weight: WEIGHTS.coverage,
    detail:
      ratio < 0.2
        ? `only ${pct(ratio)} of the board is used`
        : ratio > 0.85
          ? `${pct(ratio)} of the board is buried`
          : `${pct(ratio)} of the board is used`,
  };
}

/**
 * Colour story.
 *
 * Mean pairwise distance in linear RGB. Crude perceptually, but it reliably
 * separates "beige on beige on beige" from a board with actual contrast, which
 * is the distinction Kai cares about.
 */
function colourVariance(items: PlacedItem[]): Component {
  if (items.length < 2) {
    return {
      key: "colourVariance",
      label: "Colour story",
      value: 0,
      weight: WEIGHTS.colourVariance,
      detail: "there is no colour story with one item",
    };
  }

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].color;
      const b = items[j].color;
      total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      pairs++;
    }
  }

  const mean = total / pairs;
  // ~0.55 mean distance is about as varied as this palette gets.
  const value = clamp01(mean / 0.55);

  return {
    key: "colourVariance",
    label: "Colour story",
    value,
    weight: WEIGHTS.colourVariance,
    detail:
      value < 0.35
        ? "the palette is essentially one colour"
        : value > 0.75
          ? "genuine colour contrast"
          : "some colour variation",
  };
}

/**
 * Spatial distribution, as Shannon entropy over occupancy cells.
 *
 * Entropy rather than variance because it's scale-free: it asks whether items
 * are spread across the board or piled in one region, without caring how many
 * there are.
 */
function spatialEntropy(snapshot: BoardSnapshot, items: PlacedItem[]): Component {
  const bins = 6;
  const counts = new Array(bins * bins).fill(0);

  for (const item of items) {
    const [x, , z] = item.position;
    const bx = clampInt(
      Math.floor(((x + snapshot.boardHalfX) / (snapshot.boardHalfX * 2)) * bins),
      0,
      bins - 1,
    );
    const bz = clampInt(
      Math.floor(((z + snapshot.boardHalfZ) / (snapshot.boardHalfZ * 2)) * bins),
      0,
      bins - 1,
    );
    counts[bz * bins + bx]++;
  }

  const total = items.length;
  let entropy = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    entropy -= p * Math.log2(p);
  }

  // Normalise against the most spread this many items could possibly be.
  const maxEntropy = Math.log2(Math.min(total, counts.length));
  const value = maxEntropy > 0 ? clamp01(entropy / maxEntropy) : 0;

  return {
    key: "spatialEntropy",
    label: "Distribution",
    value,
    weight: WEIGHTS.spatialEntropy,
    detail:
      value < 0.4
        ? "everything is in one corner"
        : value > 0.8
          ? "well distributed across the board"
          : "unevenly distributed",
  };
}

/** Height variation — a board that is entirely flat has no composition to it. */
function heightVariation(snapshot: BoardSnapshot, items: PlacedItem[]): Component {
  const heights = items.map((i) => i.position[1] - snapshot.boardTop);
  const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
  const variance =
    heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length;
  const sd = Math.sqrt(variance);

  // 8cm of spread is a genuinely layered board at this scale.
  const value = clamp01(sd / 0.08);

  return {
    key: "heightVariation",
    label: "Height",
    value,
    weight: WEIGHTS.heightVariation,
    detail:
      value < 0.3
        ? "completely flat — nothing is stacked on anything"
        : value > 0.7
          ? "good vertical layering"
          : "a little height",
  };
}

/**
 * Same-food huddles.
 *
 * Only counts neighbours of the *same* food: a mixed cluster is a deliberate
 * grouping, six salami rounds touching is laziness.
 *
 * Handful-sized items are exempt entirely, as both the huddle and the thing
 * huddled against. Olives, nuts and grapes arrive in a scattered heap because
 * that is how they are served — penalising it would be scoring the food rather
 * than the arrangement, and it is the one thing the old scorer got most wrong.
 */
function clustering(items: PlacedItem[]): Component {
  const placed = items.filter((i) => i.radius > HANDFUL_RADIUS);

  if (placed.length < 2) {
    return {
      key: "clustering",
      label: "Clumping",
      value: 0,
      weight: WEIGHTS.clustering,
      detail: "nothing is clumped",
    };
  }

  let huddled = 0;
  for (const item of placed) {
    const near = placed.filter(
      (other) =>
        other !== item &&
        other.foodId === item.foodId &&
        Math.hypot(
          other.position[0] - item.position[0],
          other.position[2] - item.position[2],
        ) <
          (item.radius + other.radius) * 1.6,
    ).length;
    if (near >= 2) huddled++;
  }

  const value = clamp01(huddled / placed.length);

  return {
    key: "clustering",
    label: "Clumping",
    value,
    weight: WEIGHTS.clustering,
    detail:
      value > 0.4
        ? "large single-item huddles"
        : value > 0.15
          ? "some items are clumped together"
          : "nothing badly clumped",
  };
}

/** Everything shoved against the rim, leaving a hole in the middle. */
function edgeCrowding(snapshot: BoardSnapshot, items: PlacedItem[]): Component {
  const margin = 0.8;
  let onEdge = 0;

  for (const item of items) {
    const nx = Math.abs(item.position[0]) / snapshot.boardHalfX;
    const nz = Math.abs(item.position[2]) / snapshot.boardHalfZ;
    if (Math.max(nx, nz) > margin) onEdge++;
  }

  const value = clamp01(onEdge / items.length);

  return {
    key: "edgeCrowding",
    label: "Edge crowding",
    value,
    weight: WEIGHTS.edgeCrowding,
    detail:
      value > 0.5
        ? "almost everything is pushed to the edges"
        : value > 0.25
          ? "a lot of it is crowding the rim"
          : "sensibly away from the rim",
  };
}

/** Items on the floor. Kai considers this a personal affront. */
function fellOff(snapshot: BoardSnapshot): Component {
  const total = snapshot.items.length;
  const lost = snapshot.items.filter((i) => i.fellOff).length;
  const value = total === 0 ? 0 : clamp01(lost / total);

  return {
    key: "fellOff",
    label: "Casualties",
    value,
    weight: WEIGHTS.fellOff,
    detail:
      lost === 0
        ? "nothing on the floor"
        : lost === 1
          ? "one item on the floor"
          : `${lost} items on the floor`,
  };
}

// --- helpers ---------------------------------------------------------------

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
