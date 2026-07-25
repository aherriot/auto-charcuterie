import Link from "next/link";
import styles from "./page.module.css";

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

        <Link href="/board" className={styles.cta}>
          Start plating
        </Link>

        <p className={styles.footnote}>
          Every shape and every texture is generated from maths. There are no
          models and no images in this project.
        </p>
      </article>

      <nav className={styles.aside}>
        <Link href="/catalog">The catalogue</Link>
        <Link href="/spike/cloth">Cloth spike</Link>
      </nav>
    </main>
  );
}
