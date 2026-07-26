import styles from "./page.module.css";

/**
 * Deliberately plain <a> rather than next/link.
 *
 * Nothing on this page is interactive — it's a title card and three links — so
 * as a server component it needs no client JS at all. `next/link` is itself a
 * client component: it would hydrate here only to intercept clicks and to
 * prefetch every linked route on sight, and prefetching /board pulls its whole
 * chunk graph down onto a page that renders none of it.
 *
 * The thing we give up is a soft transition into /board, and it isn't worth
 * much: /board has to create a WebGPU device, compile shaders, and boot a
 * physics world when it arrives, so a client-side navigation saves a document
 * parse and then waits on engine init regardless.
 *
 * Links on pages that *are* already interactive should keep using next/link.
 */

export default function Home() {
  return (
    <main className={styles.main}>
      <article className={styles.card}>
        <p className={styles.eyebrow}>Est. this afternoon</p>
        <h1 className={styles.title}>Auto&#8209;Charcuterie</h1>
        <p className={styles.rule} aria-hidden="true" />

        <p className={styles.lede}>
          Build a charcuterie board. Be judged for it, harshly, by two people who
          were not invited.
        </p>

        <dl className={styles.judges}>
          <div>
            <dt>Kai</dt>
            <dd>on presentation</dd>
          </div>
          <div>
            <dt>Bartholomew</dt>
            <dd>on the food</dd>
          </div>
        </dl>

        <a href="/board" className={styles.cta}>
          Start plating
        </a>

        <p className={styles.footnote}>
          Every shape and every texture is generated from maths. There are no
          models and no images in this project.
        </p>
      </article>

      <nav className={styles.aside}>
        <a href="/catalog">The catalogue</a>
        <a href="/spike/cloth">Cloth spike</a>
      </nav>
    </main>
  );
}
