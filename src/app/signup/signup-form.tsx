"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Parent signup form — creates the Supabase account and bootstraps the family
 * (§4.2). With email auto-confirm on, signup also logs the parent in, so on
 * success it goes straight to the hub (mirroring login); only when email
 * confirmation is required does it show the "confirm your email" message (#102).
 */
export function SignupForm() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, familyName, displayName }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      session?: boolean;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ? `Could not sign up: ${data.error}` : "Could not sign up.");
      return;
    }
    if (data.session) {
      // Auto-confirm signed us in already — go to the hub (mirrors login).
      router.push("/");
      router.refresh();
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="hint" role="status">
        Account created. Check your email to confirm your address, then{" "}
        <a href="/login">log in</a>.
      </p>
    );
  }

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label>
        Family name
        <input
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          required
        />
      </label>
      <label>
        Your name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </label>
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        Create family
      </button>
    </form>
  );
}
