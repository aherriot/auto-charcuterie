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

  const kaiBand = verdictFor(KAI_VERDICTS, aesthetics.score);
  const bartBand = verdictFor(BARTHOLOMEW_VERDICTS, food.score);

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

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export { Director, type Remark } from "./director";
export { JUDGE_NAMES, JUDGE_TITLES, type Judge } from "./lines";
