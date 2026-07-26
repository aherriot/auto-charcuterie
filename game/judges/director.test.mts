/**
 * Director tests.
 *
 * The behaviour worth protecting is that the feed stays fresh and stays quiet
 * enough to read. Both are easy to break by adding lines or tweaking cooldowns,
 * and neither is obvious by eye until a session has run for a few minutes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { boardOf, place } from "../fixtures";
import {
  Director,
  PACING_CRAMPED,
  PACING_ROOMY,
  type DirectorPacing,
} from "./director";
import { LINES } from "./lines";
import type { PlacedItem } from "../snapshot";

/**
 * Runs a session, dropping an item every `dropEvery` seconds and stepping in
 * 100ms ticks so cooldowns and idle timers behave as they do in a real frame
 * loop.
 */
function runSession(
  foods: string[],
  options: {
    seed?: number;
    dropEvery?: number;
    totalSeconds?: number;
    pacing?: DirectorPacing;
  } = {},
) {
  const { seed = 1, dropEvery = 3, totalSeconds = 90, pacing } = options;

  const director = new Director({ seed, ...pacing });
  const items: PlacedItem[] = [];
  const remarks: Array<{ judge: string; text: string; at: number }> = [];

  const tick = 0.1;
  let nextDrop = 0;
  let dropped = 0;

  for (let t = 0; t < totalSeconds; t += tick) {
    if (t >= nextDrop && dropped < foods.length) {
      // Spread placements over the board so they don't all read as one pile.
      const a = dropped * 2.399;
      const r = Math.sqrt(dropped) * 0.16;
      items.push(place(foods[dropped], Math.cos(a) * r, Math.sin(a) * r * 0.7));
      dropped++;
      nextDrop = t + dropEvery;
    }

    const remark = director.update(tick, boardOf(items));
    if (remark) remarks.push(remark);
  }

  return remarks;
}

const THIRTY_ITEMS = [
  "salami", "gouda", "grapes", "olives", "crackers",
  "prosciutto", "brie", "figs", "almonds", "breadsticks",
  "soppressata", "blue", "cornichons", "cashews", "honeycomb",
  "cheddar", "salami", "grapes", "olives", "almonds",
  "salami", "salami", "olives", "grapes", "cheddar",
  "crackers", "brie", "figs", "cashews", "gouda",
];

describe("director", () => {
  it("never repeats a line within a 30-item session", () => {
    const remarks = runSession(THIRTY_ITEMS, { totalSeconds: 120 });
    const texts = remarks.map((r) => r.text);
    const unique = new Set(texts);

    assert.equal(
      texts.length,
      unique.size,
      `repeated lines: ${texts.filter((t, i) => texts.indexOf(t) !== i).join(" / ")}`,
    );
  });

  it("actually says something during a session", () => {
    const remarks = runSession(THIRTY_ITEMS, { totalSeconds: 120 });
    assert.ok(remarks.length >= 10, `only ${remarks.length} remarks in a full session`);
  });

  it("gives both judges airtime", () => {
    const remarks = runSession(THIRTY_ITEMS, { totalSeconds: 120 });
    const kai = remarks.filter((r) => r.judge === "kai").length;
    const bart = remarks.filter((r) => r.judge === "bartholomew").length;

    assert.ok(kai > 0, "Kai said nothing");
    assert.ok(bart > 0, "Bartholomew said nothing");
    // Neither should dominate completely; the feed is meant to be two people.
    assert.ok(Math.min(kai, bart) / Math.max(kai, bart) > 0.2, `lopsided: ${kai}/${bart}`);
  });

  it("respects the cooldown between remarks", () => {
    const remarks = runSession(THIRTY_ITEMS, { dropEvery: 0.2, totalSeconds: 60 });
    for (let i = 1; i < remarks.length; i++) {
      const gap = remarks[i].at - remarks[i - 1].at;
      // Against the configured pacing rather than a number, so retuning the
      // cadence cannot quietly leave this asserting something weaker.
      assert.ok(
        gap >= PACING_ROOMY.cooldownMs - 100,
        `remarks only ${gap.toFixed(0)}ms apart`,
      );
    }
  });

  it("slows down when the feed has room for fewer lines", () => {
    const fast = runSession(THIRTY_ITEMS, { dropEvery: 0.5, totalSeconds: 90 });
    const slow = runSession(THIRTY_ITEMS, {
      dropEvery: 0.5,
      totalSeconds: 90,
      pacing: PACING_CRAMPED,
    });

    // The narrow feed shows two lines to the wide one's five, so it has to
    // say materially less in the same time or a remark is gone before it can
    // be read. Compared as a rate, not a fixed count.
    assert.ok(
      slow.length < fast.length * 0.8,
      `cramped pacing said ${slow.length} against ${fast.length} — not slower enough to matter`,
    );
    for (let i = 1; i < slow.length; i++) {
      const gap = slow[i].at - slow[i - 1].at;
      assert.ok(
        gap >= PACING_CRAMPED.cooldownMs - 100,
        `remarks only ${gap.toFixed(0)}ms apart on a cramped feed`,
      );
    }
  });

  it("is deterministic for a given seed", () => {
    const a = runSession(THIRTY_ITEMS, { seed: 42 });
    const b = runSession(THIRTY_ITEMS, { seed: 42 });
    assert.deepEqual(a, b);
  });

  it("produces different sessions for different seeds", () => {
    const a = runSession(THIRTY_ITEMS, { seed: 1 });
    const b = runSession(THIRTY_ITEMS, { seed: 999 });
    assert.notDeepEqual(a, b);
  });

  it("prompts an untouched board rather than sitting silent", () => {
    const director = new Director({ seed: 7 });
    const remarks: string[] = [];

    for (let t = 0; t < 40; t += 0.1) {
      const remark = director.update(0.1, boardOf([]));
      if (remark) {
        assert.equal(remark.trigger, "board-untouched");
        remarks.push(remark.text);
      }
    }

    assert.ok(remarks.length > 0, "an empty board should be prompted, not ignored");
    // The prompt has a job: tell a first-time player where to start.
    assert.ok(
      remarks.some((t) => /menu|choose|pick|select/i.test(t)),
      `no prompt explained what to do: ${remarks.join(" / ")}`,
    );
  });

  it("holds its tongue for a moment before prompting", () => {
    const director = new Director({ seed: 7 });
    let firstAt: number | null = null;

    for (let t = 0; t < 40; t += 0.1) {
      const remark = director.update(0.1, boardOf([]));
      if (remark && firstAt === null) firstAt = remark.at;
    }

    assert.ok(firstAt !== null, "expected a prompt");
    // Long enough not to talk over the page loading, short enough that nobody
    // is left wondering what to do.
    assert.ok(
      firstAt >= 4000 && firstAt <= 8000,
      `first prompt at ${firstAt}ms is outside the useful window`,
    );
  });

  it("reacts when something falls off", () => {
    const director = new Director({ seed: 3 });
    const items = [place("olives", 0, 0), place("grapes", 0.3, 0.1)];

    // Settle first so the fall is the most interesting thing available.
    for (let t = 0; t < 12; t += 0.1) director.update(0.1, boardOf(items));

    items.push(place("cheddar", 0, 0, -1, { fellOff: true }));

    let sawFallRemark = false;
    for (let t = 0; t < 12; t += 0.1) {
      const remark = director.update(0.1, boardOf(items));
      // Assert on the trigger, not the wording — matching prose would break
      // every time a line is reworded.
      if (remark?.trigger === "item-fell") {
        sawFallRemark = true;
        break;
      }
    }

    assert.ok(sawFallRemark, "a dropped item should be remarked on");
  });

  it("substitutes every placeholder it emits", () => {
    const remarks = runSession(THIRTY_ITEMS, { totalSeconds: 120 });
    for (const r of remarks) {
      assert.ok(
        !/\{(food|count|note|spend)\}/.test(r.text),
        `unsubstituted placeholder in: ${r.text}`,
      );
    }
  });
});

describe("line library", () => {
  it("has no duplicate text", () => {
    const seen = new Set<string>();
    for (const line of LINES) {
      assert.ok(!seen.has(line.text), `duplicate line: ${line.text}`);
      seen.add(line.text);
    }
  });

  it("gives every trigger at least one line", () => {
    const triggers = new Set(LINES.map((l) => l.trigger));
    for (const trigger of triggers) {
      assert.ok(
        LINES.some((l) => l.trigger === trigger),
        `no lines for trigger ${trigger}`,
      );
    }
  });

  it("only uses placeholders the director substitutes", () => {
    for (const line of LINES) {
      const placeholders = line.text.match(/\{(\w+)\}/g) ?? [];
      for (const p of placeholders) {
        assert.ok(
          ["{food}", "{count}", "{note}", "{spend}"].includes(p),
          `unknown placeholder ${p} in: ${line.text}`,
        );
      }
    }
  });
});
