import Link from "next/link";
import { ArrowLeft, Compass, Home, Sparkles } from "lucide-react";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlowA} />
      <div className={styles.bgGlowB} />
      <div className={styles.orbit} />

      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandBadge}>
            <Sparkles size={14} />
          </span>
          <span>BENELA</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/login">Sign in</Link>
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.code}>404</div>
        <p className={styles.kicker}>Route Not Found</p>
        <h1>This page slipped outside your workspace map.</h1>
        <p className={styles.copy}>
          The destination may have moved, expired, or the URL may be incorrect.
          Return to your command center or go back to the platform homepage.
        </p>

        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.primaryAction}>
            <Compass size={16} />
            Open Dashboard
          </Link>
          <Link href="/" className={styles.secondaryAction}>
            <Home size={16} />
            Go Home
          </Link>
        </div>

        <Link href="/login" className={styles.inlineLink}>
          <ArrowLeft size={14} />
          Sign in with another account
        </Link>
      </section>
    </main>
  );
}

