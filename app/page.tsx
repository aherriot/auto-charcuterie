import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>Phase 0 · in progress</p>
      <h1 className={styles.title}>Auto&#8209;Charcuterie</h1>
      <p className={styles.blurb}>
        Build a charcuterie board. Be judged for it, harshly, by two people who
        were not invited.
      </p>

      <p className={styles.note}>
        Nothing is playable yet. The current phase is a spike answering one
        question: can we make a slice of prosciutto drape convincingly without
        soft&#8209;body physics?
      </p>

      <Link href="/spike/cloth" className={styles.cta}>
        Open the cloth spike →
      </Link>
    </main>
  );
}
