"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ERROR_TEXT: Record<string, string> = {
  missing_fields: "Enter your email and password.",
  invalid_credentials: "Email or password is incorrect.",
  no_family: "That account has no family yet — create one on the signup page.",
};
const explain = (code?: string) =>
  (code && ERROR_TEXT[code]) || "Could not log in. Try again.";

/** Parent login form — posts to the Supabase-backed login route (§3.1). */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(explain(data.error));
      return;
    }
    router.push("/");
    router.refresh();
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
          autoComplete="current-password"
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
        Log in
      </button>
    </form>
  );
}
