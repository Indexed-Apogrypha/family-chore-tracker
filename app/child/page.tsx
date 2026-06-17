import { SubmitForm } from '../components/SubmitForm';
import { StreakBadge } from '../components/StreakBadge';
import { QueueStatus } from '../components/QueueStatus';
import { getStreakState, getSeededChore } from '../../lib/server/container';
import { authMode, requireChild } from '../../lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function ChildPage() {
  if (authMode()) await requireChild();
  const [streak, { choreName }] = await Promise.all([getStreakState(), getSeededChore()]);

  return (
    <section className="stack">
      <StreakBadge streak={streak} />
      {/* Drains any photos captured offline + shows a pending count. */}
      <QueueStatus />
      <h2>{choreName}</h2>
      <p>Take a photo of your room to check it’s tidy.</p>
      <SubmitForm />
    </section>
  );
}
