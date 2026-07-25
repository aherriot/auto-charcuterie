/**
 * Settling behaviour.
 *
 * This one earns its keep. Round foods used to roll *forever*: a capsule on a
 * flat board settles into rolling without slipping, and there Rapier's contact
 * solver restores through friction very nearly what damping removes each step.
 * An olive would hold a constant 3.5cm/s indefinitely and eventually leave the
 * board — with nothing visibly wrong in a screenshot, no error, and no failing
 * assertion anywhere. It is only detectable by timing it.
 *
 * Unlike the other tests here this one loads Rapier's WASM, which is slow but
 * still runs in plain Node with no GPU and no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CATALOG } from "../../game/catalog";
import { colliderFor, dampingFor, spawnRotation } from "./bodies";
import { initPhysics, PhysicsWorld } from "./world";

const BOARD_HALF_X = 1.1;
const BOARD_HALF_Z = 0.79;
const BOARD_TOP = 0.06;
const DROP_HEIGHT = 0.85;
const STEP = 1 / 120;

await initPhysics();

interface Drop {
  /** Seconds until the body was asleep, or null if it never was. */
  sleptAt: number | null;
  /** Total horizontal ground covered after landing. */
  path: number;
  onBoard: boolean;
}

/** Drops one item at the board centre and watches it for `seconds`. */
function dropOne(foodId: string, trial: number, seconds = 8): Drop {
  const food = CATALOG.find((f) => f.id === foodId)!;
  const world = new PhysicsWorld({
    boardHalfX: BOARD_HALF_X,
    boardHalfZ: BOARD_HALF_Z,
    boardTop: BOARD_TOP,
  });

  const body = world.addBody(
    colliderFor(food, trial * 7.31 + food.price),
    [0, BOARD_TOP + DROP_HEIGHT, 0],
    spawnRotation(food.mesh),
    dampingFor(food),
  );

  let prev = world.state(body)!.position;
  let path = 0;
  let sleptAt: number | null = null;

  for (let i = 0; i < seconds * 120; i++) {
    world.step(STEP);
    const s = world.state(body);
    if (!s) break;
    // Only count travel once it is down; the fall itself is not rolling.
    if (s.position[1] < BOARD_TOP + 0.12) {
      path += Math.hypot(s.position[0] - prev[0], s.position[2] - prev[2]);
    }
    if (s.asleep && sleptAt === null) sleptAt = (i + 1) / 120;
    prev = s.position;
  }

  const last = world.state(body)!.position;
  return {
    sleptAt,
    path,
    onBoard: Math.abs(last[0]) <= BOARD_HALF_X && Math.abs(last[2]) <= BOARD_HALF_Z,
  };
}

describe("settling", () => {
  // The round ones. Each of these rolled indefinitely before damping was made
  // shape-aware, and they are the shapes at risk if the values are ever
  // "tidied up" toward the others.
  for (const id of ["olives", "cornichons", "breadsticks", "grapes"]) {
    it(`brings ${id} to rest`, () => {
      for (let t = 0; t < 4; t++) {
        const { sleptAt, path, onBoard } = dropOne(id, t);

        assert.ok(
          sleptAt !== null,
          `${id} #${t} never came to rest — it is still rolling after 8s`,
        );
        assert.ok(onBoard, `${id} #${t} rolled off the board from a centre drop`);
        // Generous: the point is that it stops, not that it lands dead. A
        // grape covering 15cm is fine; half the board is not.
        assert.ok(
          path < 0.4,
          `${id} #${t} covered ${path.toFixed(2)}m before stopping`,
        );
      }
    });
  }

  it("still lets a deflected item roll a little", () => {
    // The counterpart risk: damping cranked so high that nothing ever shifts,
    // which reads as food glued to the spot. A grape clipping the edge of a
    // cracker should travel — visibly, but not across the board.
    const grape = CATALOG.find((f) => f.id === "grapes")!;
    const cracker = CATALOG.find((f) => f.id === "crackers")!;

    let moved = 0;
    for (let t = 0; t < 4; t++) {
      const world = new PhysicsWorld({
        boardHalfX: BOARD_HALF_X,
        boardHalfZ: BOARD_HALF_Z,
        boardTop: BOARD_TOP,
      });

      world.addBody(
        colliderFor(cracker, 3),
        [0, BOARD_TOP + 0.03, 0],
        spawnRotation(cracker.mesh),
        dampingFor(cracker),
      );
      for (let i = 0; i < 240; i++) world.step(STEP);

      // Off-centre enough to clip the cracker's rim rather than land on it.
      const body = world.addBody(
        colliderFor(grape, t),
        [0.05 + t * 0.012, BOARD_TOP + DROP_HEIGHT, 0],
        spawnRotation(grape.mesh),
        dampingFor(grape),
      );

      let prev = world.state(body)!.position;
      let path = 0;
      for (let i = 0; i < 8 * 120; i++) {
        world.step(STEP);
        const s = world.state(body)!;
        if (s.position[1] < BOARD_TOP + 0.12) {
          path += Math.hypot(s.position[0] - prev[0], s.position[2] - prev[2]);
        }
        prev = s.position;
      }
      if (path > 0.01) moved++;
    }

    assert.ok(moved > 0, "a deflected grape never moved — damping is too high");
  });
});
