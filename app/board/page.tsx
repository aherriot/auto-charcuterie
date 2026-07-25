"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { BoardScene, type BoardStats } from "@/engine/board";
import { CATALOG, CATEGORY_LABELS, CATEGORY_ORDER } from "@/game/catalog";
import type { Remark } from "@/game/judges/director";
import type { Judgement } from "@/game/judges/index";
import { JUDGE_NAMES, JUDGE_TITLES } from "@/game/judges/lines";
import { WebGPUGate } from "../components/WebGPUGate";
import styles from "./page.module.css";

const EMPTY_STATS: BoardStats = {
  fps: 0,
  items: 0,
  spend: 0,
  awake: 0,
  settled: true,
  counts: {},
};

const COARSE_POINTER = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  const mq = window.matchMedia(COARSE_POINTER);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export default function BoardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);

  const [stats, setStats] = useState<BoardStats>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feed, setFeed] = useState<Remark[]>([]);
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  // Only the narrow layout acts on this; the wide card is always open. Kept in
  // one place so the head, the body and the chevron cannot disagree.
  const [menuOpen, setMenuOpen] = useState(true);
  // Which edges of the list have content past them. Drives the fades that tell
  // a touch user there is more menu than the card is showing.
  const [more, setMore] = useState({ above: false, below: false });
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Only picks the verb in the hint; nothing is laid out from it. Subscribing
  // rather than reading once keeps it right when an iPad gains a trackpad,
  // which flips the pointer to fine mid-session.
  const touch = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let scene: BoardScene | null = null;

    BoardScene.create(canvas)
      .then((s) => {
        // The effect can tear down before an async create resolves — in React
        // strict mode it reliably does — so the scene must be disposed.
        if (cancelled) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        s.onStats = setStats;
        // Keep a short tail — the feed is a running commentary, not a
        // transcript. CSS hides the older entries on narrow screens, so the
        // count here is the maximum a large display shows.
        s.onRemark = (remark) => setFeed((prev) => [...prev, remark].slice(-5));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  /** A pixel or two of slack, so a fully scrolled list doesn't keep its fade. */
  const syncMore = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const above = el.scrollTop > 3;
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 3;
    setMore((prev) =>
      prev.above === above && prev.below === below ? prev : { above, below },
    );
  }, []);

  // The card is sized against the viewport, so what overflows changes with
  // rotation, with the keyboard, and with the menu opening — measure, never
  // assume. Re-runs on open so a collapsed list is remeasured when it returns.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    syncMore();
    const observer = new ResizeObserver(syncMore);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncMore, menuOpen]);

  const onMenuScroll = useCallback(() => {
    syncMore();
    setScrolled(true);
  }, [syncMore]);

  const select = useCallback((id: string) => {
    setSelected((current) => {
      const next = current === id ? null : id;
      if (sceneRef.current) sceneRef.current.selected = next;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    sceneRef.current?.clear();
    setFeed([]);
    setJudgement(null);
  }, []);

  const serve = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    setJudgement(scene.judge());
  }, []);

  /** Names the choice in the collapsed head, so the closed card still reports. */
  const chosen = useMemo(
    () => CATALOG.find((f) => f.id === selected) ?? null,
    [selected],
  );

  /** Only foods actually on the board appear on the bill. */
  const billLines = useMemo(
    () =>
      CATALOG.filter((f) => (stats.counts[f.id] ?? 0) > 0).map((f) => ({
        food: f,
        count: stats.counts[f.id],
        line: f.price * stats.counts[f.id],
      })),
    [stats.counts],
  );

  if (error) return <WebGPUGate reason={error} />;

  return (
    <main className={styles.main}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <header className={styles.masthead}>
        <h1 className={styles.title}>Auto&#8209;Charcuterie</h1>
        <p className={styles.hint}>
          {selected
            ? touch
              ? "Tap the board to drop. Drag to orbit, pinch to zoom."
              : "Aim with the ring, click to drop. Drag to orbit."
            : "Choose from the menu, then aim at the board."}
        </p>
      </header>

      {/* --- the menu ---------------------------------------------------- */}
      <aside
        className={styles.menu}
        aria-label="Menu"
        data-open={menuOpen}
        data-more-above={more.above}
        data-more-below={more.below}
      >
        <div className={styles.menuHead}>
          <h2>Selections</h2>
          <p className={styles.menuNote}>
            {!menuOpen && chosen ? chosen.name : "Assembled to order"}
          </p>
          {/* Hidden above the narrow breakpoint, where the card always fits. */}
          <button
            type="button"
            className={styles.collapse}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="menu-body"
          >
            <span className={styles.chevron} aria-hidden="true" />
            <span className={styles.srOnly}>
              {menuOpen ? "Hide the menu" : "Show the menu"}
            </span>
          </button>
        </div>

        {/*
          The wrapper exists so the edge fades can sit still: as pseudo-elements
          of the scrolling body itself they would travel with the list.
        */}
        <div className={styles.menuScroll}>
          <div
            id="menu-body"
            ref={bodyRef}
            onScroll={onMenuScroll}
            className={styles.menuBody}
          >
            {CATEGORY_ORDER.map((c) => (
              <section key={c} className={styles.course}>
                <h3>{CATEGORY_LABELS[c]}</h3>
                {CATALOG.filter((f) => f.category === c).map((f) => {
                  const count = stats.counts[f.id] ?? 0;
                  return (
                    <button
                      key={f.id}
                      onClick={() => select(f.id)}
                      className={f.id === selected ? styles.dishOn : styles.dish}
                      aria-pressed={f.id === selected}
                    >
                      <span
                        className={styles.dot}
                        style={{
                          // Catalogue colours are linear; the swatch needs an
                          // sRGB transfer or every dish reads far darker than
                          // its food.
                          background: `rgb(${f.color
                            .map((v) => Math.round(255 * Math.pow(v, 1 / 2.2)))
                            .join(",")})`,
                        }}
                      />
                      <span className={styles.dishName}>{f.shortName}</span>
                      {count > 0 && (
                        <span className={styles.tally}>{count}</span>
                      )}
                      <span className={styles.leader} aria-hidden="true" />
                      <span className={styles.price}>{f.price.toFixed(2)}</span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>

          {/*
            One nudge for a first-time reader, on top of the fade. It goes away
            for good once the list has been scrolled — by then the point is made.
          */}
          {!scrolled && more.below && (
            <p className={styles.moreCue} aria-hidden="true">
              more
            </p>
          )}
        </div>

        <div className={styles.menuFoot}>
          <div className={styles.total}>
            <span>Total</span>
            <span className={styles.leader} aria-hidden="true" />
            <span className={styles.totalPrice}>${stats.spend.toFixed(2)}</span>
          </div>

          <div className={styles.menuActions}>
            <button
              onClick={clear}
              className={styles.clear}
              disabled={stats.items === 0}
            >
              Clear
            </button>
            <button
              onClick={serve}
              className={styles.serve}
              disabled={stats.items === 0}
            >
              Serve
            </button>
          </div>
        </div>
      </aside>

      {/* --- running commentary ------------------------------------------ */}
      {feed.length > 0 && !judgement && (
        <div className={styles.feed} aria-live="polite">
          {feed.map((r) => (
            <p
              key={`${r.at}-${r.text}`}
              className={r.judge === "kai" ? styles.kai : styles.bart}
            >
              <strong>{JUDGE_NAMES[r.judge]}</strong>
              {r.text}
            </p>
          ))}
        </div>
      )}

      {/* --- the bill ----------------------------------------------------- */}
      {judgement && (
        <div className={styles.billScreen} role="dialog" aria-label="The bill">
          <div className={styles.billWrap}>
            <article className={styles.bill}>
              <header className={styles.billHead}>
                <p className={styles.billEyebrow}>Auto&#8209;Charcuterie</p>
              </header>

              {/*
                The judgement comes first in the DOM so that a single-column
                card reads verdict-then-charges; the wide layout puts the two
                side by side without reordering anything.
              */}
              <div className={styles.billBody}>
                <div className={styles.assessment}>
                  <h2 className={styles.billTitle}>The judges</h2>

                  <div className={styles.scores}>
                    <p className={styles.scoresLabel}>Assessed</p>
                    <p className={styles.overall}>
                      {Math.round(judgement.overall)}
                    </p>
                  </div>

                  {[judgement.kai, judgement.bartholomew].map((v) => (
                    <section key={v.judge} className={styles.verdict}>
                      <header>
                        <h3>{JUDGE_NAMES[v.judge]}</h3>
                        <span className={styles.role}>
                          {JUDGE_TITLES[v.judge]}
                        </span>
                        <span className={styles.mark}>{Math.round(v.score)}</span>
                      </header>
                      <p className={styles.headline}>{v.headline}</p>
                      <p className={styles.body}>{v.body}</p>
                      {v.criticism && (
                        <p className={styles.against}>{v.criticism}.</p>
                      )}
                      {v.credit && <p className={styles.credit}>{v.credit}.</p>}
                    </section>
                  ))}
                </div>

                <div className={styles.charges}>
                  <h2 className={styles.billTitle}>The bill</h2>

                  <div className={styles.billItems}>
                    {billLines.map(({ food, count, line }) => (
                      <div key={food.id} className={styles.billRow}>
                        <span className={styles.billQty}>{count}</span>
                        <span className={styles.billName}>{food.name}</span>
                        <span className={styles.leader} aria-hidden="true" />
                        <span className={styles.billPrice}>
                          {line.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className={styles.billTotal}>
                    <span>Total</span>
                    <span className={styles.leader} aria-hidden="true" />
                    <span>${stats.spend.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.billActions}>
                <button onClick={() => setJudgement(null)} className={styles.keep}>
                  Keep building
                </button>
                <button onClick={clear} className={styles.again}>
                  Start again
                </button>
              </div>
            </article>
          </div>
        </div>
      )}

      <footer className={styles.debug}>
        <span className={stats.fps < 55 ? styles.bad : styles.good}>
          {stats.fps.toFixed(0)} fps
        </span>
        <span>{stats.items} items</span>
        <span>{stats.settled ? "settled" : `${stats.awake} moving`}</span>
        <Link href="/" className={styles.link}>
          home
        </Link>
        <Link href="/catalog" className={styles.link}>
          catalogue
        </Link>
      </footer>
    </main>
  );
}
