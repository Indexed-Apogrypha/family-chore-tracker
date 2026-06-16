// Public API of the judging core. The vendor seam (JudgeClient) and the
// pipeline are the stable surface the rest of the app depends on.
//
// Note: the live Gemini adapter (./gemini) is intentionally NOT re-exported
// here, so importing the judging core never pulls in the vendor SDK. Import it
// directly from './judge/gemini' where the live adapter is actually needed.
export * from './types';
export * from './evaluateVerdict';
export * from './parse';
export * from './prompt';
export * from './client';
export * from './pipeline';
