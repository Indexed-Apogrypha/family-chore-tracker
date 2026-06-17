/**
 * Builds the instruction prompt for the vision judge. The reference and
 * submission images are attached separately by the adapter. Encodes the v1
 * rubric: compare the submission against the parent's reference, classify
 * deviations by severity, and be fair about minor messiness.
 */
export function buildJudgePrompt(choreName: string): string {
  return [
    `You are an impartial judge for a family chore app. The chore is: "${choreName}".`,
    '',
    'You are given two images:',
    "  1. REFERENCE — the parent's photo of the room in its accepted \"done\" state.",
    "  2. SUBMISSION — the child's photo of the room now, which you must judge.",
    '',
    'Compare the SUBMISSION against the REFERENCE and list how the submission',
    'deviates from the reference. For each deviation assign a severity:',
    '  - "high":   a clear, substantial problem (e.g. clothing or items on the',
    '              floor, bed unmade when the reference bed is made, surfaces',
    '              cluttered when the reference surfaces are clear).',
    '  - "medium": noticeable but minor.',
    '  - "low":    trivial or cosmetic.',
    '',
    'Be fair. Minor messiness must be "low", never "high". Differences in',
    'lighting, camera angle, time of day, or photo quality are NOT deviations.',
    'If the images are too dark, blurry, or differently framed to compare',
    'confidently, set "uncertain" to true and explain why in "notes".',
    '',
    'Respond with ONLY a JSON object of exactly this shape (no prose, no fences):',
    '{',
    '  "matches_reference": boolean,',
    '  "verdict": "pass" | "fail",',
    '  "confidence": number,        // 0..1, your confidence in this judgment',
    '  "deviations": [ { "item": string, "issue": string, "severity": "high" | "medium" | "low" } ],',
    '  "uncertain": boolean,',
    '  "notes": string',
    '}',
  ].join('\n');
}
