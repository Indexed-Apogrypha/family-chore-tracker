import Link from "next/link";
import { redirect } from "next/navigation";

import { isRealMode } from "@/composition/env";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { listMembers } from "@/usecases/members";

import { ProfileSwitcher } from "./profile-switcher";

/**
 * The shared-device hub (design §3.1, §4.2). A thin screen: derive the request
 * context, load the family's members through a use-case, and render the profile
 * switcher. Unauthenticated devices are sent to `/login`. Member DTOs are mapped
 * to `{ id, displayName, kind }` so a kid's `pin_hash` never crosses to the client.
 */
export default async function Home() {
  const ctx = await deriveContext();
  if (!ctx) redirect("/login");

  const result = await listMembers(serverPorts(), ctx);
  const members = (result.ok ? result.value : []).map((m) => ({
    id: m.id as string,
    displayName: m.displayName,
    kind: m.kind,
  }));

  return (
    <main>
      <h1>Family Chore Tracker</h1>
      <p className="board-link">
        <Link href="/board">View today&rsquo;s chores →</Link>
        {ctx.actor.kind === "parent" ? (
          <Link href="/templates" className="manage-link">
            Manage chores →
          </Link>
        ) : null}
      </p>
      <ProfileSwitcher
        members={members}
        activeMemberId={ctx.actor.memberId as string}
        canManage={ctx.actor.kind === "parent"}
        practiceMode={!isRealMode()}
      />
    </main>
  );
}
