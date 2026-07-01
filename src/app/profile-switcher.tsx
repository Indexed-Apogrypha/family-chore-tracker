"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { type ApiErrorBody, errorMessageFromBody } from "@/app/error-copy";

interface MemberDto {
  id: string;
  displayName: string;
  kind: "parent" | "kid";
}

interface Props {
  members: MemberDto[];
  activeMemberId: string;
  /** Only a parent actor may add kids or sees the management affordances. */
  canManage: boolean;
  /** Keyless practice mode — show the demo-kid hint. */
  practiceMode: boolean;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return { ok: res.ok, body: data };
}

const PROFILE_ERRORS = {
  not_found: "That profile is no longer available.",
  forbidden: "Only a parent can do that.",
};
const explain = (body: ApiErrorBody) =>
  errorMessageFromBody(body, PROFILE_ERRORS);

/**
 * The parent↔kid profile switcher (design §3.1). Selecting the parent switches
 * instantly; selecting a kid reveals a PIN prompt. Mutations go through the
 * route handlers and then `router.refresh()` re-renders the server component
 * with the new active profile.
 */
export function ProfileSwitcher({
  members,
  activeMemberId,
  canManage,
  practiceMode,
}: Props) {
  const router = useRouter();
  const active = members.find((m) => m.id === activeMemberId);
  const parents = members.filter((m) => m.kind === "parent");
  const kids = members.filter((m) => m.kind === "kid");

  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function switchTo(memberId: string, withPin?: string) {
    setBusy(true);
    setError(null);
    const { ok, body } = await postJson("/api/profile/switch", {
      memberId,
      pin: withPin,
    });
    setBusy(false);
    if (!ok) {
      setError(explain(body));
      return;
    }
    setPinFor(null);
    setPin("");
    router.refresh();
  }

  async function logout() {
    if (!window.confirm("Log out of this device?")) return;
    setBusy(true);
    await postJson("/api/auth/logout");
    router.push("/login");
  }

  return (
    <section className="switcher">
      <p className="acting">
        Acting as <strong>{active ? active.displayName : "—"}</strong>
        {active ? ` (${active.kind})` : ""}
      </p>

      <h2>Switch profile</h2>
      <ul className="tiles">
        {parents.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="tile"
              disabled={busy || m.id === activeMemberId}
              onClick={() => switchTo(m.id)}
            >
              <span className="tile-name">{m.displayName}</span>
              <span className="tile-kind">parent</span>
            </button>
          </li>
        ))}
        {kids.map((m) => (
          <li key={m.id}>
            {pinFor === m.id ? (
              <form
                className="pin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  switchTo(m.id, pin);
                }}
              >
                <label htmlFor={`pin-${m.id}`}>{m.displayName}&rsquo;s PIN</label>
                <input
                  id={`pin-${m.id}`}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  autoFocus
                  onChange={(e) => setPin(e.target.value)}
                />
                <div className="pin-actions">
                  <button type="submit" disabled={busy}>
                    Unlock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinFor(null);
                      setPin("");
                      setError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="tile"
                disabled={busy || m.id === activeMemberId}
                onClick={() => {
                  setError(null);
                  setPinFor(m.id);
                }}
              >
                <span className="tile-name">{m.displayName}</span>
                <span className="tile-kind">kid · PIN</span>
              </button>
            )}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <AddKid busy={busy} onAdded={() => router.refresh()} />
      ) : null}

      {practiceMode ? (
        <p className="hint">
          Practice mode — the demo kid&rsquo;s PIN is <code>1234</code>.
        </p>
      ) : null}

      <button type="button" className="logout" onClick={logout} disabled={busy}>
        Log out
      </button>
    </section>
  );
}

function AddKid({ busy, onAdded }: { busy: boolean; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    const { ok, body } = await postJson("/api/members", {
      displayName: name,
      pin,
    });
    setSaving(false);
    if (!ok) {
      setError(explain(body));
      return;
    }
    setName("");
    setPin("");
    onAdded();
  }

  return (
    <form
      className="add-kid"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>Add a kid</h2>
      <div className="fields">
        <label htmlFor="add-kid-name">
          Name
          <input
            id="add-kid-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label htmlFor="add-kid-pin">
          PIN
          <input
            id="add-kid-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy || saving}>
        Add kid
      </button>
    </form>
  );
}
