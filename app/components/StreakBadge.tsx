import type { StreakState } from '../../src/streak';

export function StreakBadge({ streak }: { streak: StreakState }) {
  return (
    <div className="streak">
      <span className="streak-current">{streak.current}</span>
      <span>day streak</span>
      <span className="streak-meta">
        Longest: {streak.longest} day{streak.longest === 1 ? '' : 's'}
        {' · '}
        {streak.lastPassDate ? `Last pass: ${streak.lastPassDate}` : 'No passes yet'}
      </span>
    </div>
  );
}
