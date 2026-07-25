/**
 * The dialogue director.
 *
 * Decides which judge says what, and when. Deterministic given a seed, so a
 * session can be replayed exactly in tests — the alternative is flaky assertions
 * about comedy, which is not a thing anyone should have to debug.
 *
 * Two rules do most of the work:
 *
 *   1. **No repeats within a session.** Every line said is remembered and
 *      excluded from selection. Hearing the same joke twice is worse than
 *      hearing a weaker one once.
 *   2. **A cooldown between lines.** Without it, dropping five items quickly
 *      produces five simultaneous quips and the feed becomes noise.
 */

import { CATALOG, foodById, repetitionLimit } from "../catalog";
import { onBoard, type BoardSnapshot } from "../snapshot";
import { pairingFor, PAIRING_RADIUS } from "../scoring/pairings";
import { LINES, type Judge, type Line, type TriggerId } from "./lines";

export interface Remark {
  judge: Judge;
  text: string;
  /**
   * What prompted the line. Exposed so callers can react to the *event* rather
   * than pattern-matching prose — the UI styles casualties differently, and
   * tests can assert on cause instead of wording.
   */
  trigger: TriggerId;
  /** Milliseconds since the session started. */
  at: number;
}

export interface DirectorOptions {
  seed?: number;
  /** Minimum gap between remarks, ms. */
  cooldownMs?: number;
  /** Silence before idle heckling starts, ms. */
  idleAfterMs?: number;
  /**
   * Silence before the judges prompt an untouched board. Shorter than idle
   * heckling — a player who hasn't worked out where to start should not be
   * left wondering for eleven seconds.
   */
  openingAfterMs?: number;
}

interface Substitutions {
  food?: string;
  count?: number;
  note?: string;
  spend?: string;
}

/**
 * A detected trigger.
 *
 * `commit` records whatever state marks the event as consumed, and is invoked
 * only once a line has actually been chosen and emitted.
 */
interface Trigger {
  id: TriggerId;
  subs: Substitutions;
  judge?: Judge;
  commit?: () => void;
}

/**
 * Spend thresholds that get remarked on, once each. Dollars.
 *
 * Prices are per piece, so a full board lands nearer $15 than $75; these are
 * spaced to fire at roughly 4, 8, 15 and 23 items — the same pacing the old
 * per-packet prices gave, which is what the line pool was written against.
 */
const SPEND_MILESTONES = [2.5, 5, 9, 14];

export class Director {
  private cooldownMs: number;
  private idleAfterMs: number;
  private openingAfterMs: number;

  private rngState: number;
  /**
   * Every line said this session.
   *
   * Not a bounded ring buffer: with one, lines age out and start recurring
   * partway through a long session, which is exactly when a player is most
   * likely to notice. Sessions are short enough that remembering all of them
   * costs nothing.
   */
  private said = new Set<string>();
  private lastSpokeAt = 0;
  private elapsed = 0;

  private seenFoods = new Set<string>();
  private seenCategories = new Set<string>();
  private milestonesHit = new Set<number>();
  private reportedFallen = new Set<number>();
  private reportedPairs = new Set<string>();
  private itemCount = 0;
  private crowdedRemarks = 0;
  private emptyRemarks = 0;

  constructor(options: DirectorOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 2600;
    this.idleAfterMs = options.idleAfterMs ?? 11000;
    this.openingAfterMs = options.openingAfterMs ?? 5000;
    this.rngState = (options.seed ?? 1) >>> 0 || 1;
  }

  /**
   * Advances time and returns any remark that fires this tick.
   *
   * Called every frame with the current snapshot; returns null most of the time.
   */
  update(dt: number, snapshot: BoardSnapshot): Remark | null {
    this.elapsed += dt * 1000;

    const trigger = this.detectTrigger(snapshot);
    if (!trigger) return null;

    if (this.elapsed - this.lastSpokeAt < this.waitFor(trigger.id)) return null;

    const line = this.pick(trigger.id, trigger.judge);
    if (!line) return null;

    // Only now mark the event as consumed. Detection is deliberately
    // side-effect-free: an earlier version marked events as reported *during*
    // detection, so any event whose tick happened to fall inside the cooldown
    // was silently swallowed and never mentioned. Items would fall off the
    // board to complete silence.
    trigger.commit?.();

    this.lastSpokeAt = this.elapsed;
    this.remember(line.text);

    return {
      judge: line.judge,
      text: substitute(line.text, trigger.subs),
      trigger: trigger.id,
      at: this.elapsed,
    };
  }

  /**
   * Finds the most interesting thing that has happened.
   *
   * Ordered by priority: something falling off the board beats a routine
   * placement, and both beat silence.
   */
  private detectTrigger(snapshot: BoardSnapshot): Trigger | null {
    const items = onBoard(snapshot);

    // Casualties first — always the most interesting thing on screen.
    for (const item of snapshot.items) {
      if (item.fellOff && !this.reportedFallen.has(item.instanceId)) {
        return {
          id: "item-fell",
          subs: { food: nameOf(item.foodId) },
          commit: () => this.reportedFallen.add(item.instanceId),
        };
      }
    }

    const newest = snapshot.items[snapshot.items.length - 1];
    const isNewItem = snapshot.items.length > this.itemCount;

    if (isNewItem && newest) {
      const foodName = nameOf(newest.foodId);
      // Placement count advances immediately: it tracks what has been *seen*,
      // not what has been spoken about, and leaving it stale would re-fire the
      // same placement on every subsequent tick.
      this.itemCount = snapshot.items.length;

      if (snapshot.items.length === 1) {
        return {
          id: "first-item",
          subs: { food: foodName },
          commit: () => {
            this.seenFoods.add(newest.foodId);
            this.seenCategories.add(newest.category);
          },
        };
      }

      // Touching clashes and pairings are worth more than a bare placement.
      const contact = this.findContact(snapshot, newest.instanceId);
      if (contact) {
        return {
          id: contact.score < 0 ? "clash-placed" : "pairing-placed",
          subs: { note: contact.note, food: foodName },
          judge: "bartholomew",
          commit: () => this.reportedPairs.add(contact.key),
        };
      }

      // The same size-aware limit the scorer uses, so the judges never object
      // to something the bill will not mark down.
      const food = foodById(newest.foodId);
      const count = items.filter((i) => i.foodId === newest.foodId).length;
      if (food && count > repetitionLimit(food)) {
        return { id: "repetition", subs: { food: foodName, count } };
      }

      if (!this.seenCategories.has(newest.category)) {
        return {
          id: "category-new",
          subs: { food: foodName },
          commit: () => this.seenCategories.add(newest.category),
        };
      }

      for (const milestone of SPEND_MILESTONES) {
        if (snapshot.totalSpend >= milestone && !this.milestonesHit.has(milestone)) {
          return {
            id: "spend-milestone",
            subs: { spend: snapshot.totalSpend.toFixed(2), food: foodName },
            commit: () => this.milestonesHit.add(milestone),
          };
        }
      }

      // Crowding is a state, not an event: without a cap it would fire on
      // every placement past the threshold and exhaust its small line pool.
      if (items.length >= 22 && this.crowdedRemarks < 2) {
        return {
          id: "board-crowded",
          subs: { food: foodName },
          commit: () => this.crowdedRemarks++,
        };
      }

      return { id: "item-placed", subs: { food: foodName } };
    }

    // Nothing has been placed at all. Prompt rather than sit silent: the
    // player may not have realised the menu is where you start.
    if (snapshot.items.length === 0) {
      return { id: "board-untouched", subs: {} };
    }

    if (items.length <= 3 && this.elapsed > this.idleAfterMs && this.emptyRemarks < 2) {
      return {
        id: "board-empty-ish",
        subs: {},
        commit: () => this.emptyRemarks++,
      };
    }

    return { id: "idle", subs: {} };
  }

  /**
   * How long a trigger must wait since the last remark.
   *
   * Event lines follow the short cooldown; ambient ones wait out a real
   * silence. The very first prompt on an untouched board comes soonest,
   * because it is the one line that teaches the player what to do.
   */
  private waitFor(id: TriggerId): number {
    if (id === "idle" || id === "board-empty-ish") return this.idleAfterMs;
    if (id === "board-untouched") {
      return this.lastSpokeAt === 0 ? this.openingAfterMs : this.idleAfterMs;
    }
    return this.cooldownMs;
  }

  /**
   * A pairing or clash involving the newest item, reported at most once.
   *
   * Returns the key rather than recording it, so the caller can decide whether
   * the pairing was actually spoken about before marking it used.
   */
  private findContact(
    snapshot: BoardSnapshot,
    instanceId: number,
  ): { note: string; score: number; key: string } | null {
    const items = onBoard(snapshot);
    const subject = items.find((i) => i.instanceId === instanceId);
    if (!subject) return null;

    for (const other of items) {
      if (other.instanceId === instanceId || other.foodId === subject.foodId) continue;

      const pairing = pairingFor(subject.foodId, other.foodId);
      if (!pairing) continue;

      const distance = Math.hypot(
        subject.position[0] - other.position[0],
        subject.position[2] - other.position[2],
      );
      if (distance > PAIRING_RADIUS) continue;

      const k = [pairing.a, pairing.b].sort().join("|");
      if (this.reportedPairs.has(k)) continue;

      return { note: pairing.note, score: pairing.score, key: k };
    }

    return null;
  }

  /**
   * Weighted pick among eligible lines, excluding anything already said.
   *
   * Falls back to reusing a line rather than staying silent — exhausting a
   * trigger's pool should degrade to a repeat, not to a mute judge. If that
   * fallback fires often, the answer is more lines, not a smaller cooldown.
   */
  private pick(trigger: TriggerId, judge?: Judge): Line | null {
    const all = LINES.filter(
      (l) => l.trigger === trigger && (!judge || l.judge === judge),
    );
    if (all.length === 0) return null;

    const fresh = all.filter((l) => !this.said.has(l.text));
    const pool = fresh.length > 0 ? fresh : all;

    const total = pool.reduce((sum, l) => sum + l.weight, 0);
    let roll = this.random() * total;
    for (const line of pool) {
      roll -= line.weight;
      if (roll <= 0) return line;
    }
    return pool[pool.length - 1];
  }

  private remember(text: string) {
    this.said.add(text);
  }

  /** Mulberry32 — small, fast, and deterministic given the seed. */
  private random(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  reset() {
    this.said.clear();
    this.lastSpokeAt = 0;
    this.elapsed = 0;
    this.seenFoods.clear();
    this.seenCategories.clear();
    this.milestonesHit.clear();
    this.reportedFallen.clear();
    this.reportedPairs.clear();
    this.itemCount = 0;
    this.crowdedRemarks = 0;
    this.emptyRemarks = 0;
  }
}

function nameOf(foodId: string): string {
  return CATALOG.find((f) => f.id === foodId)?.shortName ?? foodId;
}

function substitute(text: string, subs: Substitutions): string {
  return text
    .replace(/\{food\}/g, subs.food ?? "that")
    .replace(/\{count\}/g, String(subs.count ?? 0))
    .replace(/\{note\}/g, subs.note ?? "")
    .replace(/\{spend\}/g, subs.spend ?? "0.00");
}
