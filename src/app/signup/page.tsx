import Link from "next/link";
import { redirect } from "next/navigation";

import { isRealMode } from "@/composition/env";
import { deriveContext } from "@/composition/request";

import { SignupForm } from "./signup-form";

/**
 * Signup screen (design §3.1, §4.2). Real mode creates a Supabase account and
 * bootstraps the founder's family. In keyless practice mode there are no
 * accounts, so it points back to the one-click practice entry.
 */
export default async function SignupPage() {
  if (await deriveContext()) redirect("/");

  if (!isRealMode()) {
    return (
      <main>
        <h1>Family Chore Tracker</h1>
        <p className="hint">
          Practice mode needs no account.{" "}
          <Link href="/login">Enter a practice family</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Create your family</h1>
      <SignupForm />
      <p className="hint">
        Already have an account? <Link href="/login">Log in</Link>.
      </p>
    </main>
  );
}
