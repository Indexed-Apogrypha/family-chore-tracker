import Link from "next/link";
import { redirect } from "next/navigation";

import { isRealMode } from "@/composition/env";
import { deriveContext } from "@/composition/request";

import { LoginForm } from "./login-form";
import { PracticeEntry } from "./practice-entry";

/**
 * Login screen (design §3.1). Real mode shows the Supabase email/password form;
 * keyless practice mode offers a one-click entry into a demo family. Already
 * authenticated devices skip straight to the hub.
 */
export default async function LoginPage() {
  if (await deriveContext()) redirect("/");

  return (
    <main>
      <h1>Family Chore Tracker</h1>
      {isRealMode() ? (
        <>
          <h2>Log in</h2>
          <LoginForm />
          <p className="hint">
            No account yet? <Link href="/signup">Create a family</Link>.
          </p>
        </>
      ) : (
        <PracticeEntry />
      )}
    </main>
  );
}
