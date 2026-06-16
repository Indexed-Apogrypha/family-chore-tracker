import { PhotoThumb } from '../../components/PhotoThumb';
import { VerdictCard } from '../../components/VerdictCard';
import { getStores, getSeededChore } from '../../../lib/server/container';
import { getHistory } from '../../../src/submission';
import { authMode, requireParent } from '../../../lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  if (authMode()) await requireParent();
  const { submissions } = await getStores();
  const { choreId } = await getSeededChore();
  // getHistory returns oldest→newest; show most-recent first.
  const recentFirst = (await getHistory(submissions, choreId)).reverse();

  return (
    <section className="stack">
      <h2>History</h2>
      {recentFirst.length === 0 ? (
        <p className="muted">No submissions yet.</p>
      ) : (
        <ul className="history">
          {recentFirst.map((entry) => (
            <li key={entry.submission.id} className="history-item">
              <PhotoThumb image={entry.submission.image} alt="Submitted photo" />
              <p className="muted">{new Date(entry.submission.createdAt).toLocaleString()}</p>
              {entry.verdict ? (
                <VerdictCard verdict={entry.verdict} />
              ) : (
                <p className="muted">No verdict yet.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
