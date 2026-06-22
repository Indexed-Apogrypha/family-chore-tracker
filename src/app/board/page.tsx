import Link from "next/link";
import { redirect } from "next/navigation";

import { serverPorts } from "@/composition/server";
import { deriveContext } from "@/composition/request";
import type { InstanceStatus } from "@/domain/shared/enums";
import { getTodayBoard } from "@/usecases/chores";
import { listMembers } from "@/usecases/members";

/** Friendly labels for the instance lifecycle (design §7.1). */
const STATUS_LABEL: Record<InstanceStatus, string> = {
  todo: "To do",
  evaluating: "Checking…",
  pending_review: "Awaiting parent",
  approved: "Approved",
};

/**
 * The active profile's "today" board (design §7.3, §8.1). A thin screen: derive
 * the request context, materialize + read the day's chores through
 * `getTodayBoard` (recurring instances are generated on this read), and render
 * them with their lifecycle status. Read-only for now — photo submission lands
 * in M3. Unauthenticated devices are sent to `/login`.
 */
export default async function BoardPage() {
  const ctx = await deriveContext();
  if (!ctx) redirect("/login");

  const ports = serverPorts();
  const today = ports.clock.today();

  const result = await getTodayBoard(ports, ctx, {
    memberId: ctx.actor.memberId,
  });
  const chores = (result.ok ? result.value : []).map((i) => ({
    id: i.id as string,
    title: i.title,
    points: i.points,
    status: i.status,
    isOneOff: i.templateId === null,
  }));

  const members = await listMembers(ports, ctx);
  const me = (members.ok ? members.value : []).find(
    (m) => m.id === ctx.actor.memberId,
  );

  return (
    <main>
      <p className="board-nav">
        <Link href="/">← Profiles</Link>
      </p>
      <h1>Today&rsquo;s chores</h1>
      <p className="board-sub">
        {me ? `${me.displayName} · ` : ""}
        {today}
      </p>

      {chores.length === 0 ? (
        <p className="hint">No chores for today. 🎉</p>
      ) : (
        <ul className="board">
          {chores.map((c) => (
            <li key={c.id} className="chore">
              <div className="chore-main">
                <span className="chore-title">{c.title}</span>
                <span className="chore-points">{c.points} pts</span>
              </div>
              <div className="chore-meta">
                <span className={`status status-${c.status}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                {c.isOneOff ? <span className="chore-tag">one-off</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
