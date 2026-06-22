"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Keyless practice entry. One click bootstraps an in-memory demo family (a
 * parent + one kid) and drops you on the hub — no account, no Supabase, no AI
 * spend. The path the test suite and local dev exercise by default.
 */
export function PracticeEntry() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/practice", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      setError("Could not start practice mode.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <section className="practice">
      <h2>Practice mode</h2>
      <p className="hint">
        Supabase isn&rsquo;t configured, so accounts are off. Enter a demo family
        to try the parent &amp; kid profile switch.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={enter} disabled={busy}>
        Enter practice family
      </button>
    </section>
  );
}
