"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { type ApiErrorBody, errorMessageFromBody } from "@/app/error-copy";
import type { Recurrence } from "@/domain/shared/enums";

interface TemplateDto {
  id: string;
  title: string;
  points: number;
  recurrence: Recurrence;
  assigneeName: string;
  active: boolean;
}

interface KidDto {
  id: string;
  displayName: string;
}

interface Props {
  templates: TemplateDto[];
  kids: KidDto[];
  /** `clock.today()` — the default due date for a one-off. */
  today: string;
}

/** 0 = Sunday … 6 = Saturday, matching the recurrence weekday convention. */
const WEEKDAYS = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
];

const TEMPLATE_ERRORS = {
  forbidden: "Only a parent can do that.",
  not_found: "That chore or kid is no longer available.",
};
const explain = (body: ApiErrorBody) =>
  errorMessageFromBody(body, TEMPLATE_ERRORS);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return { ok: res.ok, body: data };
}

function recurrenceLabel(r: Recurrence): string {
  if (r.kind === "daily") return "Daily";
  if (r.kind === "none") return "One-off";
  const days = [...r.days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d]?.label ?? d)
    .join(", ");
  return `Weekly · ${days || "—"}`;
}

/**
 * Parent chore management (design §6, §8): list templates with a deactivate /
 * reactivate toggle, plus forms to add a recurring template or a one-off chore.
 * Every mutation goes through a route handler and then `router.refresh()`
 * re-renders the server component with fresh data. Capability is enforced
 * server-side in the use-cases; this UI just guides the parent.
 */
export function TemplateManager({ templates, kids, today }: Props) {
  const router = useRouter();
  // Per-template busy id so only the toggled row's button disables — the
  // parent can still see (and use) the rest of the list.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    setError(null);
    const { ok, body } = await postJson("/api/templates/active", {
      templateId: id,
      active,
    });
    setBusyId(null);
    if (!ok) {
      setError(explain(body));
      return;
    }
    router.refresh();
  }

  return (
    <section className="manager">
      <h2>Chores</h2>
      {templates.length === 0 ? (
        <p className="hint">No chores yet — add one below.</p>
      ) : (
        <ul className="template-list">
          {templates.map((t) => (
            <li
              key={t.id}
              className={`template-row${t.active ? "" : " inactive"}`}
            >
              <div className="template-main">
                <span className="template-title">{t.title}</span>
                <span className="template-meta">
                  {recurrenceLabel(t.recurrence)} · {t.points} pts ·{" "}
                  {t.assigneeName}
                  {t.active ? "" : " · inactive"}
                </span>
              </div>
              <button
                type="button"
                disabled={busyId === t.id}
                aria-label={`${t.active ? "Deactivate" : "Reactivate"} ${t.title}`}
                onClick={() => toggleActive(t.id, !t.active)}
              >
                {t.active ? "Deactivate" : "Reactivate"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {kids.length === 0 ? (
        <p className="hint">
          Add a kid on the Profiles screen first, then assign chores to them.
        </p>
      ) : (
        <>
          <AddTemplate kids={kids} onSaved={() => router.refresh()} />
          <AddOneOff
            kids={kids}
            today={today}
            onSaved={() => router.refresh()}
          />
        </>
      )}
    </section>
  );
}

function AddTemplate({
  kids,
  onSaved,
}: {
  kids: KidDto[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(5);
  const [kind, setKind] = useState<"daily" | "weekly">("daily");
  const [days, setDays] = useState<number[]>([1]); // default Monday
  const [assignee, setAssignee] = useState(kids[0].id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleDay(n: number) {
    setDays((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n],
    );
  }

  async function submit() {
    if (kind === "weekly" && days.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }
    setSaving(true);
    setError(null);
    const recurrence: Recurrence =
      kind === "daily" ? { kind: "daily" } : { kind: "weekly", days };
    const { ok, body } = await postJson("/api/templates", {
      title,
      points,
      recurrence,
      assignedMemberId: assignee,
    });
    setSaving(false);
    if (!ok) {
      setError(explain(body));
      return;
    }
    setTitle("");
    setPoints(5);
    onSaved();
  }

  return (
    <form
      className="chore-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>Add a recurring chore</h2>
      <label htmlFor="tpl-title">
        Title
        <input
          id="tpl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label htmlFor="tpl-points">
        Points
        <input
          id="tpl-points"
          type="number"
          min={1}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          required
        />
      </label>
      <label htmlFor="tpl-kind">
        Repeats
        <select
          id="tpl-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "daily" | "weekly")}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {kind === "weekly" ? (
        <fieldset className="weekdays">
          <legend>On</legend>
          {WEEKDAYS.map((d) => (
            <label key={d.n} className="weekday">
              <input
                type="checkbox"
                checked={days.includes(d.n)}
                onChange={() => toggleDay(d.n)}
              />
              {d.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <label htmlFor="tpl-assignee">
        Assign to
        <select
          id="tpl-assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {k.displayName}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={saving}>
        Add chore
      </button>
    </form>
  );
}

function AddOneOff({
  kids,
  today,
  onSaved,
}: {
  kids: KidDto[];
  today: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(5);
  const [assignee, setAssignee] = useState(kids[0].id);
  const [dueDate, setDueDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    const { ok, body } = await postJson("/api/oneoffs", {
      title,
      points,
      assignedMemberId: assignee,
      dueDate,
    });
    setSaving(false);
    if (!ok) {
      setError(explain(body));
      return;
    }
    setTitle("");
    setPoints(5);
    onSaved();
  }

  return (
    <form
      className="chore-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>Add a one-off chore</h2>
      <label htmlFor="oneoff-title">
        Title
        <input
          id="oneoff-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label htmlFor="oneoff-points">
        Points
        <input
          id="oneoff-points"
          type="number"
          min={1}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          required
        />
      </label>
      <label htmlFor="oneoff-due">
        Due date
        <input
          id="oneoff-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />
      </label>
      <label htmlFor="oneoff-assignee">
        Assign to
        <select
          id="oneoff-assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {k.displayName}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={saving}>
        Add one-off
      </button>
    </form>
  );
}
