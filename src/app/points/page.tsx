import Link from "next/link";
import { redirect } from "next/navigation";

import { errorMessage } from "@/app/error-copy";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { pointsHistory, pointsTotal } from "@/usecases/points";

/**
 * The active profile's points history (design §6, §8.1): the running total plus
 * the append-only ledger behind it — each credit resolved to the chore it was
 * earned for, newest first. Any family member sees their own history (the
 * active profile is the lens, like /board). Unauthenticated devices → /login.
 */
export default async function PointsPage() {
  const ctx = await deriveContext();
  if (!ctx) redirect("/login");

  const ports = serverPorts();
  const [totalResult, historyResult] = await Promise.all([
    pointsTotal(ports, ctx, { memberId: ctx.actor.memberId }),
    pointsHistory(ports, ctx, { memberId: ctx.actor.memberId }),
  ]);
  const total = totalResult.ok ? totalResult.value : 0;

  return (
    <main>
      <p className="board-nav">
        <Link href="/board">← Today&rsquo;s chores</Link>
      </p>
      <h1>Points</h1>
      <p className="board-sub">
        <span className="points-total">{total} pts</span> earned so far
      </p>

      {!historyResult.ok ? (
        <p className="error" role="alert">
          {errorMessage(historyResult.error.code, {
            persistence_unavailable:
              "Couldn't load your points history just now — try again shortly.",
          })}
        </p>
      ) : historyResult.value.length === 0 ? (
        <p className="hint">
          Nothing earned yet — finish a chore and get it approved to see it here.
        </p>
      ) : (
        <ul className="history">
          {historyResult.value.map((item, i) => (
            <li key={`${item.earnedAt}-${i}`} className="history-row">
              <div className="history-main">
                <span className="history-title">{item.choreTitle}</span>
                <span className="history-date">
                  {item.earnedAt.slice(0, 10)}
                </span>
              </div>
              <span className="history-delta">+{item.delta} pts</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
