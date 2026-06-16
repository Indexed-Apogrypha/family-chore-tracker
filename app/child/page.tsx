import { SubmitForm } from '../components/SubmitForm';
import { StreakBadge } from '../components/StreakBadge';
import { getStreakState, getSeededChore } from '../../lib/server/container';

export const dynamic = 'force-dynamic';

export default async function ChildPage() {
  const [streak, { choreName }] = await Promise.all([getStreakState(), getSeededChore()]);

  return (
    <section className="stack">
      <StreakBadge streak={streak} />
      <h2>{choreName}</h2>
      <p>Take a photo of your room to check it’s tidy.</p>
      <SubmitForm />
    </section>
  );
}
