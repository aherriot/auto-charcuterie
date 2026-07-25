import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>Phase 1 · renderer core</p>
      <h1 className={styles.title}>Auto&#8209;Charcuterie</h1>
      <p className={styles.blurb}>
        Build a charcuterie board. Be judged for it, harshly, by two people who
        were not invited.
      </p>

      <p className={styles.note}>
        Not playable yet. The board renders and you can walk around it, but
        nothing lands on it by hand until Phase 3. Everything you see is
        generated from maths &mdash; there are no models or textures in this
        project.
      </p>

      <nav className={styles.links}>
        <Link href="/board" className={styles.cta}>
          View the board →
        </Link>
        <Link href="/spike/cloth" className={styles.secondary}>
          Cloth spike
        </Link>
      </nav>
    </main>
  );
}
