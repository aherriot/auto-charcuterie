/**
 * Scoring tests.
 *
 * These run in plain Node with no GPU and no browser, which is the entire point
 * of keeping `game/` free of engine imports — scoring weights are the thing
 * we'll tune most, and needing a canvas to check a pairing matrix would make
 * that miserable.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  awfulBoard,
  boardOf,
  emptyBoard,
  goodBoard,
  place,
  singleItemBoard,
} from "../fixtures";
import { scoreAesthetics } from "./aesthetics";
import { scoreFood } from "./food";
import { pairingFor, PAIRINGS, PAIRING_RADIUS } from "./pairings";
import { judge } from "../judges/index";
import { CATALOG } from "../catalog";

describe("pairing matrix", () => {
  it("is symmetric", () => {
    for (const p of PAIRINGS) {
      assert.equal(pairingFor(p.a, p.b)?.score, pairingFor(p.b, p.a)?.score);
    }
  });

  it("never pairs a food with itself", () => {
    for (const p of PAIRINGS) {
      assert.notEqual(p.a, p.b, `${p.a} paired with itself`);
      assert.equal(pairingFor(p.a, p.a), null);
    }
  });

  it("references only real foods", async () => {
    const { CATALOG } = await import("../catalog");
    const ids = new Set(CATALOG.map((f) => f.id));
    for (const p of PAIRINGS) {
      assert.ok(ids.has(p.a), `unknown food in pairing: ${p.a}`);
      assert.ok(ids.has(p.b), `unknown food in pairing: ${p.b}`);
    }
  });

  it("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const p of PAIRINGS) {
      const k = [p.a, p.b].sort().join("|");
      assert.ok(!seen.has(k), `duplicate pairing: ${k}`);
      seen.add(k);
    }
  });
});

describe("aesthetic scoring", () => {
  it("scores a good board well above an awful one", () => {
    const good = scoreAesthetics(goodBoard()).score;
    const awful = scoreAesthetics(awfulBoard()).score;
    assert.ok(
      good > awful + 25,
      `expected a clear gap, got good=${good.toFixed(1)} awful=${awful.toFixed(1)}`,
    );
  });

  it("gives an empty board zero", () => {
    assert.equal(scoreAesthetics(emptyBoard()).score, 0);
  });

  it("always returns a score within 0–100", () => {
    for (const board of [goodBoard(), awfulBoard(), emptyBoard(), singleItemBoard()]) {
      const { score } = scoreAesthetics(board);
      assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
    }
  });

  it("penalises items that fell off", () => {
    const items = goodBoard().items;
    const intact = scoreAesthetics(boardOf(items)).score;
    const dropped = scoreAesthetics(
      boardOf(items.map((i, n) => (n < 3 ? { ...i, fellOff: true } : i))),
    ).score;
    assert.ok(dropped < intact, "losing items should not improve the score");
  });

  it("penalises a single-colour board", () => {
    const varied = boardOf([
      place("grapes", -0.4, 0),
      place("brie", 0, 0),
      place("olives", 0.4, 0),
    ]);
    const monotone = boardOf([
      place("brie", -0.4, 0),
      place("crackers", 0, 0),
      place("almonds", 0.4, 0),
    ]);

    const variedColour = scoreAesthetics(varied).components.find(
      (c) => c.key === "colourVariance",
    )!;
    const monotoneColour = scoreAesthetics(monotone).components.find(
      (c) => c.key === "colourVariance",
    )!;

    assert.ok(
      variedColour.value > monotoneColour.value,
      "a varied palette should out-score a beige one",
    );
  });

  it("rewards spread over a single pile", () => {
    const spread = boardOf([
      place("olives", -0.7, -0.4),
      place("olives", 0.6, 0.3),
      place("grapes", 0.0, -0.2),
      place("brie", -0.2, 0.45),
    ]);
    const piled = boardOf([
      place("olives", -0.7, -0.4),
      place("olives", -0.68, -0.38),
      place("grapes", -0.72, -0.42),
      place("brie", -0.69, -0.39),
    ]);

    const spreadEntropy = scoreAesthetics(spread).components.find(
      (c) => c.key === "spatialEntropy",
    )!;
    const piledEntropy = scoreAesthetics(piled).components.find(
      (c) => c.key === "spatialEntropy",
    )!;

    assert.ok(spreadEntropy.value > piledEntropy.value);
  });
});

describe("food scoring", () => {
  it("scores a good board well above an awful one", () => {
    const good = scoreFood(goodBoard()).score;
    const awful = scoreFood(awfulBoard()).score;
    assert.ok(
      good > awful + 25,
      `expected a clear gap, got good=${good.toFixed(1)} awful=${awful.toFixed(1)}`,
    );
  });

  it("counts a pairing only when the items are close together", () => {
    const near = boardOf([place("figs", 0, 0), place("blue", 0.08, 0)]);
    const far = boardOf([place("figs", -0.9, -0.6), place("blue", 0.9, 0.6)]);

    const nearPairings = scoreFood(near).findings.filter((f) => f.kind === "pairing");
    const farPairings = scoreFood(far).findings.filter((f) => f.kind === "pairing");

    assert.equal(nearPairings.length, 1, "adjacent fig and blue should pair");
    assert.equal(farPairings.length, 0, "opposite corners should not pair");
  });

  it("respects the pairing radius exactly", () => {
    const inside = boardOf([
      place("figs", 0, 0),
      place("blue", PAIRING_RADIUS - 0.01, 0),
    ]);
    const outside = boardOf([
      place("figs", 0, 0),
      place("blue", PAIRING_RADIUS + 0.01, 0),
    ]);

    assert.equal(scoreFood(inside).findings.filter((f) => f.kind === "pairing").length, 1);
    assert.equal(scoreFood(outside).findings.filter((f) => f.kind === "pairing").length, 0);
  });

  it("counts each food pair once regardless of instance count", () => {
    // Six grapes around one prosciutto should be one pairing, not six —
    // otherwise spamming a single item is the dominant strategy.
    const items = [place("prosciutto", 0, 0)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      items.push(place("grapes", Math.cos(a) * 0.1, Math.sin(a) * 0.1));
    }

    const pairings = scoreFood(boardOf(items)).findings.filter(
      (f) => f.kind === "pairing",
    );
    assert.equal(pairings.length, 1);
  });

  it("penalises repetition past what the item's size allows", () => {
    const repeated = (foodId: string, n: number) =>
      scoreFood(
        boardOf(
          Array.from({ length: n }, (_, i) =>
            place(foodId, -0.9 + (i % 10) * 0.2, -0.3 + Math.floor(i / 10) * 0.3),
          ),
        ),
      ).findings.filter((f) => f.kind === "repetition");

    assert.equal(repeated("salami", 3).length, 0, "three rounds is a selection");
    assert.equal(repeated("salami", 9).length, 1, "nine is a pile");
  });

  it("lets small items be scattered in handfuls", () => {
    // The whole point of almonds. This is the case the old flat limit of three
    // got wrong: a dozen is a garnish, not a lapse in judgement.
    const dozen = boardOf(
      Array.from({ length: 12 }, (_, i) =>
        place("almonds", -0.9 + (i % 6) * 0.3, -0.2 + Math.floor(i / 6) * 0.4),
      ),
    );

    assert.equal(
      scoreFood(dozen).findings.filter((f) => f.kind === "repetition").length,
      0,
      "a dozen almonds is fine",
    );

    // Sizes differ, so the same count lands on opposite sides of the line.
    const dozenWedges = boardOf(
      Array.from({ length: 12 }, (_, i) =>
        place("brie", -0.9 + (i % 6) * 0.3, -0.2 + Math.floor(i / 6) * 0.4),
      ),
    );

    assert.ok(
      scoreFood(dozenWedges).findings.some((f) => f.kind === "repetition"),
      "a dozen brie wedges is not",
    );
  });

  it("rewards hitting all five categories", () => {
    const balanced = boardOf([
      place("salami", -0.6, -0.3),
      place("gouda", -0.2, -0.3),
      place("grapes", 0.2, -0.3),
      place("olives", 0.6, -0.3),
      place("crackers", 0, 0.35),
    ]);
    const narrow = boardOf([
      place("salami", -0.6, -0.3),
      place("soppressata", -0.2, -0.3),
    ]);

    assert.equal(scoreFood(balanced).missingCategories.length, 0);
    assert.ok(scoreFood(narrow).missingCategories.length > 0);
    assert.ok(scoreFood(balanced).score > scoreFood(narrow).score);
  });

  it("flags clashes that are touching", () => {
    const board = boardOf([
      place("honeycomb", 0, 0),
      place("cornichons", 0.05, 0),
    ]);
    const clashes = scoreFood(board).findings.filter((f) => f.kind === "clash");
    assert.equal(clashes.length, 1);
    assert.ok(clashes[0].points < 0);
  });

  it("always returns a score within 0–100", () => {
    for (const board of [goodBoard(), awfulBoard(), emptyBoard(), singleItemBoard()]) {
      const { score } = scoreFood(board);
      assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
    }
  });
});

describe("judgement", () => {
  it("produces a verdict with specific criticism for a bad board", () => {
    const result = judge(awfulBoard());
    assert.ok(result.kai.headline.length > 0);
    assert.ok(result.bartholomew.headline.length > 0);
    assert.ok(
      result.bartholomew.criticism,
      "an awful board should give Bartholomew something specific to object to",
    );
  });

  it("rates a good board above an awful one overall", () => {
    assert.ok(judge(goodBoard()).overall > judge(awfulBoard()).overall + 20);
  });

  it("does not invent credit for an empty board", () => {
    const result = judge(emptyBoard());
    assert.equal(result.kai.credit, null);
    assert.equal(result.overall, 0);
  });

  it("judges the same board the same way every time", () => {
    // Pressing Serve twice on an unchanged board must not change its mind —
    // that reads as a bug, not as variety.
    const board = goodBoard();
    const a = judge(board);
    const b = judge(board);
    assert.equal(a.kai.headline, b.kai.headline);
    assert.equal(a.bartholomew.body, b.bartholomew.body);
  });

  it("varies the phrasing across boards that score alike", () => {
    // Guards the hash behind the variant choice. It is easy to write one that
    // looks fine and quietly returns the same index every time — the first
    // attempt here reached only two of every four phrasings, because FNV's low
    // bits are weak and the modulo is small.
    const kai = new Set<string>();
    const bart = new Set<string>();

    for (let s = 0; s < 60; s++) {
      const n = 3 + (s % 9);
      const items = Array.from({ length: n }, (_, i) =>
        place(
          CATALOG[(s * 7 + i * 5) % CATALOG.length].id,
          -0.8 + ((i * 13 + s) % 9) * 0.2,
          -0.6 + ((i * 7 + s) % 5) * 0.3,
        ),
      );
      const result = judge(boardOf(items));
      kai.add(result.kai.headline);
      bart.add(result.bartholomew.headline);
    }

    assert.ok(kai.size >= 4, `Kai only ever said ${kai.size} different things`);
    assert.ok(
      bart.size >= 4,
      `Bartholomew only ever said ${bart.size} different things`,
    );
  });
});
