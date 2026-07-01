import Link from "next/link";
import { redirect } from "next/navigation";

import { errorMessage } from "@/app/error-copy";
import { serverPorts } from "@/composition/server";
import { deriveContext } from "@/composition/request";
import { listTemplates } from "@/usecases/chores";
import { listMembers } from "@/usecases/members";

import { TemplateManager } from "./template-manager";

/**
 * Parent chore-management screen (design §6, §8). A thin server component:
 * derive the request context, load templates + members through use-cases, and
 * render the manager. Parent-only — a kid actor is sent back to the hub;
 * unauthenticated devices to `/login`. The acting parent's capability is also
 * enforced inside every use-case the client calls.
 */
export default async function TemplatesPage() {
  const ctx = await deriveContext();
  if (!ctx) redirect("/login");
  if (ctx.actor.kind !== "parent") redirect("/");

  const ports = serverPorts();
  const [templatesResult, membersResult] = await Promise.all([
    listTemplates(ports, ctx),
    listMembers(ports, ctx),
  ]);

  const members = membersResult.ok ? membersResult.value : [];
  const kids = members
    .filter((m) => m.kind === "kid")
    .map((m) => ({ id: m.id as string, displayName: m.displayName }));
  const nameById = new Map(members.map((m) => [m.id as string, m.displayName]));

  const templates = (templatesResult.ok ? templatesResult.value : []).map(
    (t) => ({
      id: t.id as string,
      title: t.title,
      points: t.points,
      recurrence: t.recurrence,
      assigneeName: nameById.get(t.assignedMemberId as string) ?? "—",
      active: t.active,
    }),
  );

  return (
    <main>
      <p className="board-nav">
        <Link href="/">← Profiles</Link>
      </p>
      <h1>Manage chores</h1>
      {!templatesResult.ok ? (
        <p className="error" role="alert">
          {errorMessage(templatesResult.error.code, {
            persistence_unavailable:
              "Couldn't load your chores just now — try again shortly.",
          })}
        </p>
      ) : (
        <TemplateManager
          templates={templates}
          kids={kids}
          today={ports.clock.today()}
        />
      )}
    </main>
  );
}
