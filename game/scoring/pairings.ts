/**
 * The pairing matrix — hand-authored, symmetric, and opinionated.
 *
 * Pairings are **proximity-gated**: two foods only count as paired if they
 * actually sit near each other on the board. That quietly ties the two judges'
 * axes together — you can't satisfy Bartholomew by scattering a fig and a blue
 * to opposite corners — and it rewards deliberate composition without Kai
 * having to say so.
 *
 * Scores are roughly -3 (actively wrong) to +3 (canonical).
 */

export interface Pairing {
  a: string;
  b: string;
  score: number;
  /** Bartholomew's justification, surfaced in commentary and the verdict. */
  note: string;
}

/**
 * Distance in world units within which two items count as paired. Roughly a
 * third of the board's short axis — close enough to read as a deliberate
 * grouping, generous enough that it doesn't demand pixel-perfect stacking.
 */
export const PAIRING_RADIUS = 0.26;

export const PAIRINGS: Pairing[] = [
  // --- canonical, the ones that earn real credit -------------------------
  { a: "figs", b: "blue", score: 3, note: "fig and blue is the pairing every other pairing is judged against" },
  { a: "prosciutto", b: "grapes", score: 3, note: "salt and sweet, the oldest trick there is" },
  { a: "honeycomb", b: "blue", score: 3, note: "honey over blue — sweetness cutting the salt" },
  { a: "almonds", b: "brie", score: 2.5, note: "marcona and brie, texture against softness" },
  { a: "prosciutto", b: "figs", score: 2.5, note: "prosciutto and fig, entirely correct" },
  { a: "honeycomb", b: "brie", score: 2, note: "honey on brie, obvious but effective" },
  { a: "gouda", b: "grapes", score: 2, note: "aged gouda with grapes, no notes" },
  { a: "soppressata", b: "cornichons", score: 2, note: "cured pork wants acid, and cornichons deliver" },
  { a: "salami", b: "cornichons", score: 1.8, note: "the pickle is doing the salami a favour" },
  { a: "blue", b: "grapes", score: 1.8, note: "blue and grape, a reliable combination" },
  { a: "crackers", b: "brie", score: 1.5, note: "a vehicle for the brie, at least" },
  { a: "crackers", b: "gouda", score: 1.5, note: "the cracker is functioning as intended" },
  { a: "breadsticks", b: "prosciutto", score: 2.2, note: "grissini wrapped in prosciutto, a genuine classic" },
  { a: "almonds", b: "gouda", score: 1.6, note: "aged gouda and marcona, both nutty, both correct" },
  { a: "cashews", b: "honeycomb", score: 1.2, note: "cashew and honey, pleasant if unambitious" },
  { a: "olives", b: "soppressata", score: 1.7, note: "olive and soppressata, the standard aperitivo pairing" },
  { a: "olives", b: "gouda", score: 1.2, note: "brine against an aged cheese, which works" },
  { a: "breadsticks", b: "soppressata", score: 1.4, note: "grissini and soppressata, unfussy and correct" },
  { a: "crackers", b: "blue", score: 1.3, note: "the cracker is carrying the blue, as it should" },

  // --- clashes ------------------------------------------------------------
  { a: "cornichons", b: "honeycomb", score: -2.5, note: "vinegar and honey, touching. Someone should be held accountable" },
  { a: "cornichons", b: "figs", score: -2, note: "pickle brine and fig is not a combination, it is an accident" },
  { a: "cheddar", b: "blue", score: -2, note: "supermarket cheddar next to a Stilton, like a hymn interrupted" },
  { a: "cheddar", b: "figs", score: -1.8, note: "the fig deserved better company" },
  { a: "cornichons", b: "grapes", score: -1.5, note: "acid and sweet fruit, fighting" },
  { a: "cheddar", b: "honeycomb", score: -1.5, note: "honey cannot rescue that cheddar" },
  { a: "cheddar", b: "prosciutto", score: -1.6, note: "Parma ham, and that. Genuinely upsetting" },
  { a: "salami", b: "honeycomb", score: -1.2, note: "sweet on a coarse salami, muddled" },
  { a: "blue", b: "cornichons", score: -1.4, note: "the blue is loud enough without a pickle arguing back" },
];

/**
 * Symmetric lookup, built once.
 *
 * Throws on a duplicate rather than letting the later entry silently win: the
 * matrix is hand-authored and it is genuinely easy to add `figs|prosciutto`
 * having already written `prosciutto|figs`, which then quietly overrides a
 * score you meant to keep.
 */
const INDEX = new Map<string, Pairing>();
for (const p of PAIRINGS) {
  const k = key(p.a, p.b);
  if (INDEX.has(k)) {
    throw new Error(`Duplicate pairing in matrix: ${p.a} + ${p.b}`);
  }
  INDEX.set(k, p);
}

function key(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The pairing between two food ids, or null if the matrix is silent on them. */
export function pairingFor(a: string, b: string): Pairing | null {
  if (a === b) return null;
  return INDEX.get(key(a, b)) ?? null;
}
