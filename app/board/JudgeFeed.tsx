"use client";

/**
 * The running commentary.
 *
 * A short stack of judge remarks in the corner of the board, newest at the
 * foot, oldest falling off the top once the stack is full.
 *
 * The whole of the animation problem here is that the list is *bottom
 * anchored*: a new line at the foot displaces every line above it upwards by
 * exactly its own height, in a single layout pass, which reads as a jump.
 * Per-line height animation is the obvious answer and the wrong one — it
 * needs every line's animation to stay in lockstep, and any drift between
 * them is visible as exactly the jump it was meant to remove.
 *
 * So instead nothing here animates height at all. The list is measured before
 * and after each change, and the whole list is transformed back to where it
 * was and released (a FLIP). One transform covers every line, so they cannot
 * drift apart, and it is a correction of what actually happened rather than a
 * prediction of it — whatever moves, glides.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import type { Remark } from "@/game/judges/director";
import { JUDGE_NAMES } from "@/game/judges/lines";
import styles from "./page.module.css";

// Below this width the feed keeps only the two most recent lines, so it never
// crowds out the board it's commenting on. This used to be a CSS media query
// hiding the overflow with `display: none`, which fought with the animation
// below — no transition plays across a display change, and it has no idea a
// remark is mid-exit. Feeding the same breakpoint into the cap that drives
// eviction makes it one mechanism instead of two disagreeing ones.
const FEED_WIDE = "(min-width: 1100px)";
const FEED_CAP_WIDE = 5;
const FEED_CAP_NARROW = 2;

/**
 * How long a departing remark spends fading before it leaves the list. Must
 * match the transition on `.feed p.leaving` in the stylesheet: this timer is
 * what unmounts it, and unmounting early cuts the fade off.
 */
const FEED_FADE_MS = 360;

/**
 * The slide. Matched to the `fade` animation on `.feed p` in the stylesheet,
 * so a new line finishes arriving exactly as the stack finishes making room
 * for it — two halves of one movement rather than two events.
 */
const FEED_SLIDE_MS = 520;
const FEED_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeFeedWide(onChange: () => void) {
  const mq = window.matchMedia(FEED_WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Whether the feed is showing its full stack or its short one.
 *
 * Exported because how many lines are on show and how often the judges speak
 * are the same question asked twice — the board reads this to pace the
 * director. Keeping one breakpoint means the two cannot drift apart.
 */
export function useFeedWide() {
  return useSyncExternalStore(
    subscribeFeedWide,
    () => window.matchMedia(FEED_WIDE).matches,
    () => false,
  );
}

/** A remark on screen, and whether it is on its way out. */
interface Entry {
  remark: Remark;
  leaving: boolean;
}

/**
 * Remarks arrive from the scene's frame loop rather than from React, so the
 * feed takes them by hand rather than by prop — a prop would mean the board
 * re-rendering its canvas, its menu and its bill every time a judge speaks.
 */
export interface JudgeFeedHandle {
  push(remark: Remark): void;
  clear(): void;
}

/** Remark text is never repeated within a session, so this is stable and unique. */
const keyOf = (r: Remark) => `${r.at}-${r.text}`;

/** How far a still-running slide currently has the list displaced. */
function displacement(el: HTMLElement) {
  const t = getComputedStyle(el).transform;
  return !t || t === "none" ? 0 : new DOMMatrixReadOnly(t).f;
}

export function JudgeFeed({
  ref,
  hidden = false,
}: {
  ref?: Ref<JudgeFeedHandle>;
  /** The bill covers the board; the commentary steps aside without losing its place. */
  hidden?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  // Remarks arrive outside React's knowledge, so the current list has to be
  // readable without waiting for a render to land.
  const entriesRef = useRef<Entry[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  // Where each line sat, and how tall it was, at the last commit. Keyed by the
  // element itself, which is only sound because entries render as one list:
  // React keeps the same node for a remark from arrival to removal, including
  // across the change of class that starts its fade.
  const topsRef = useRef<Map<Element, { top: number; height: number }>>(
    new Map(),
  );
  const capRef = useRef(FEED_CAP_WIDE);

  const wide = useFeedWide();
  const cap = wide ? FEED_CAP_WIDE : FEED_CAP_NARROW;

  const commit = useCallback((next: Entry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  /**
   * Applies the cap. Anything over it is marked as leaving rather than
   * dropped, so it can fade; a timer takes it out of the list once it has.
   * Returns the list unchanged when there is nothing to retire, so callers
   * can test identity rather than re-rendering for no reason.
   */
  const retire = useCallback(
    (next: Entry[], limit: number) => {
      const live = next.filter((e) => !e.leaving);
      const over = live.length - limit;
      if (over <= 0) return next;

      const doomed = new Set(live.slice(0, over).map((e) => e.remark));
      const id = setTimeout(() => {
        timersRef.current.delete(id);
        commit(entriesRef.current.filter((e) => !doomed.has(e.remark)));
      }, FEED_FADE_MS);
      timersRef.current.add(id);

      return next.map((e) =>
        doomed.has(e.remark) ? { ...e, leaving: true } : e,
      );
    },
    [commit],
  );

  useImperativeHandle(
    ref,
    () => ({
      push(remark) {
        const next = [...entriesRef.current, { remark, leaving: false }];
        commit(retire(next, capRef.current));
      },
      clear() {
        timersRef.current.forEach(clearTimeout);
        timersRef.current.clear();
        commit([]);
      },
    }),
    [commit, retire],
  );

  // The cap is reactive — a rotation into the narrow layout keeps fewer lines
  // — so shrinking it has to evict the same way a new remark does, through
  // the fade, not through a CSS cutoff that cannot animate.
  useEffect(() => {
    capRef.current = cap;
    const next = retire(entriesRef.current, cap);
    if (next !== entriesRef.current) commit(next);
  }, [cap, retire, commit]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // The FLIP. Runs before paint, so the list is put back where it was and
  // released in the same frame the change lands — nothing is ever painted in
  // its jumped position.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      topsRef.current = new Map();
      return;
    }

    const previous = topsRef.current;
    // A slide already in flight is part of where the eye currently sees the
    // list, so it is measured out of the positions below and added back into
    // the new slide rather than being dropped.
    const inFlight = displacement(list);

    const tops = new Map<Element, { top: number; height: number }>();
    let moved = 0;
    let anchored = false;
    let reflowed = false;
    for (const line of list.children) {
      const box = line.getBoundingClientRect();
      const top = box.top - inFlight;
      tops.set(line, { top, height: box.height });

      const was = previous.get(line);
      if (was === undefined) continue;
      // One transform for the whole list is only the right answer while every
      // line keeps its size. A line that has changed height has re-wrapped —
      // the window crossed a breakpoint — and then the lines have moved by
      // different amounts and none of this applies. The new layout is the
      // right answer already; leave it alone.
      if (Math.abs(was.height - box.height) > 0.5) reflowed = true;
      // Otherwise every line moves together, so the first one still on screen
      // from last time measures the move for all of them.
      if (!anchored) {
        moved = was.top - top;
        anchored = true;
      }
    }
    topsRef.current = tops;

    // Nothing shifted — a line leaving the top of a foot-anchored stack moves
    // none of the others — so there is nothing to correct, and a slide still
    // running is left to finish rather than being restarted from here.
    if (!anchored || reflowed || Math.abs(moved) < 0.5) return;
    if (window.matchMedia(REDUCED_MOTION).matches) return;

    list.style.transition = "none";
    list.style.transform = `translateY(${moved + inFlight}px)`;
    void list.offsetHeight; // flush, so the transition has a start to run from
    list.style.transition = `transform ${FEED_SLIDE_MS}ms ${FEED_EASE}`;
    list.style.transform = "translateY(0)";
  }, [entries, hidden]);

  if (hidden || entries.length === 0) return null;

  return (
    <div className={styles.feedWrap} aria-live="polite">
      <div ref={listRef} className={styles.feed}>
        {entries.map(({ remark, leaving }) => {
          const judge = remark.judge === "kai" ? styles.kai : styles.bart;
          return (
            <p
              key={keyOf(remark)}
              className={leaving ? `${judge} ${styles.leaving}` : judge}
            >
              <strong>{JUDGE_NAMES[remark.judge]}</strong>
              {remark.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
