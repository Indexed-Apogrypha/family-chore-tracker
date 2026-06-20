// Public API of the streak (gamification) module. `computeStreak` is the pure
// policy seam the rest of the app depends on — streaks are computed from the
// submission/verdict event stream, never stored (docs/PRD.md).
export * from './types';
export * from './computeStreak';
