import type { Verdict } from '../../src/judge';

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  const passed = verdict.result === 'pass';
  const needsReview = verdict.status === 'needs_review';

  return (
    <div className={`verdict ${passed ? 'verdict-pass' : 'verdict-fail'}`}>
      <p className="verdict-result">{passed ? '✅ Passed' : '❌ Not yet'}</p>
      {needsReview && <p className="verdict-review">🔎 Needs a parent’s review</p>}
      <p>Confidence: {Math.round(verdict.confidence * 100)}%</p>
      {verdict.notes && <p>{verdict.notes}</p>}
      {verdict.deviations.length > 0 && (
        <ul className="verdict-deviations">
          {verdict.deviations.map((deviation, index) => (
            <li key={`${deviation.item}-${index}`} className={`dev-${deviation.severity}`}>
              <span className="dev-severity">{deviation.severity}</span> {deviation.item}:{' '}
              {deviation.issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
