/**
 * Judgement — the combined verdict both judges deliver at the end.
 *
 * Ties scoring to voice: each judge leads with the single most damaging thing
 * on their own axis, quoting the specific finding rather than a generic band
 * message. "Everything is in one corner" lands; "presentation: 42" does not.
 */

import { scoreAesthetics, type AestheticResult } from "../scoring/aesthetics";
import { scoreFood, type FoodResult } from "../scoring/food";
import type { BoardSnapshot } from "../snapshot";
import {
  BARTHOLOMEW_VERDICTS,
  KAI_VERDICTS,
  verdictFor,
  type Judge,
} from "./lines";

export interface JudgeVerdict {
  judge: Judge;
  score: number;
  headline: string;
  body: string;
  /** The specific observation this judge is leading with. */
  criticism: string | null;
  /** Grudging credit, where any is due. */
  credit: string | null;
}

export interface Judgement {
  kai: JudgeVerdict;
  bartholomew: JudgeVerdict;
  /** Mean of the two, which is what the score card headlines. */
  overall: number;
  aesthetics: AestheticResult;
  food: FoodResult;
}

export function judge(snapshot: BoardSnapshot): Judgement {
  const aesthetics = scoreAesthetics(snapshot);
  const food = scoreFood(snapshot);

  // Which phrasing each judge reaches for. Derived from the board rather than
  // drawn at random so a given board is always judged in the same words, while
  // two boards that happen to score alike are not.
  const variant = variantSeed(snapshot);
  const kaiBand = verdictFor(KAI_VERDICTS, aesthetics.score, variant);
  const bartBand = verdictFor(BARTHOLOMEW_VERDICTS, food.score, variant + 1);

  const kai: JudgeVerdict = {
    judge: "kai",
    score: aesthetics.score,
    headline: kaiBand.headline,
    body: kaiBand.body,
    criticism: aesthetics.weakest ? capitalise(aesthetics.weakest.detail) : null,
    // Only claim a strength if it's actually strong — praising a 0.2 makes the
    // whole verdict read as noise.
    credit:
      aesthetics.strongest && aesthetics.strongest.value > 0.6
        ? capitalise(aesthetics.strongest.detail)
        : null,
  };

  const bartholomew: JudgeVerdict = {
    judge: "bartholomew",
    score: food.score,
    headline: bartBand.headline,
    body: bartBand.body,
    criticism: food.worstOffence ? capitalise(food.worstOffence.note) : null,
    credit: food.bestPairing ? capitalise(food.bestPairing.note) : null,
  };

  return {
    kai,
    bartholomew,
    overall: (aesthetics.score + food.score) / 2,
    aesthetics,
    food,
  };
}

/**
 * A small integer that depends on what is actually on the board.
 *
 * Item count alone would be too coarse — most boards land in a narrow range of
 * counts — so the food ids and rounded positions go in too. Any board the
 * player would call "the same board" hashes the same; nudging one item into a
 * different spot may well shift the wording, which is fine.
 */
function variantSeed(snapshot: BoardSnapshot): number {
  // FNV-1a. Math.imul keeps the multiply in 32 bits — plain `*` overflows past
  // 2^53 within a couple of rounds and silently drops the low bits.
  let h = 2166136261;
  const mix = (v: number) => {
    h = Math.imul(h ^ v, 16777619);
  };

  for (const item of snapshot.items) {
    for (let i = 0; i < item.foodId.length; i++) mix(item.foodId.charCodeAt(i));
    mix(Math.round(item.position[0] * 20));
    mix(Math.round(item.position[2] * 20));
  }

  // Avalanche. FNV mixes its high bits well and its low bits poorly, and the
  // caller takes this modulo four — without a finaliser two of every four
  // phrasings simply never come up.
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;

  return h >>> 0;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export { Director, type Remark } from "./director";
export { JUDGE_NAMES, JUDGE_TITLES, type Judge } from "./lines";
