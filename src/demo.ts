/**
 * Tracer-bullet runner for the reference→verdict pipeline.
 *
 *   npm run demo
 *       Runs scripted scenarios through the fake judge — proves the spine
 *       end-to-end with no network or secrets.
 *
 *   ANTHROPIC_API_KEY=... (or GEMINI_API_KEY=...) npm run demo -- <reference> <submission> ["Chore name"]
 *       Runs the live judge on two real images through the exact same seam.
 *       Vendor precedence mirrors the app: ANTHROPIC_API_KEY → Claude, else
 *       GEMINI_API_KEY → Gemini.
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { runJudgment } from './judge/pipeline';
import { FakeJudgeClient, type JudgeClient } from './judge/client';
import { CLEAN_PASS, MESSY_FAIL, BLURRY_UNCERTAIN } from './judge/fixtures';
import type { JudgeInput, ModelJudgment, Verdict } from './judge/types';

function printVerdict(label: string, verdict: Verdict): void {
  console.log(`\n=== ${label} ===`);
  console.log(
    `result: ${verdict.result}   status: ${verdict.status}   ` +
      `confidence: ${verdict.confidence}   model: ${verdict.model}`,
  );
  if (verdict.deviations.length > 0) {
    console.log('deviations:');
    for (const d of verdict.deviations) {
      console.log(`  - [${d.severity}] ${d.item}: ${d.issue}`);
    }
  }
  console.log(`notes: ${verdict.notes}`);
}

function mimeFromPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

// Vendor precedence mirrors lib/server/container.ts: Anthropic first, then
// Gemini. Lazy imports so the fake path never loads a vendor SDK.
async function makeLiveClient(): Promise<JudgeClient> {
  if (process.env.JUDGE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) {
    const { AnthropicJudgeClient } = await import('./judge/claude');
    return new AnthropicJudgeClient();
  }
  if (process.env.GEMINI_API_KEY) {
    const { GeminiJudgeClient } = await import('./judge/gemini');
    return new GeminiJudgeClient();
  }
  throw new Error(
    'No vendor key set. Set JUDGE_ANTHROPIC_API_KEY/ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY (Gemini) to run the live judge.',
  );
}

async function runLive(
  refPath: string,
  subPath: string,
  choreName: string,
): Promise<void> {
  const client = await makeLiveClient();
  const [ref, sub] = await Promise.all([readFile(refPath), readFile(subPath)]);
  const input: JudgeInput = {
    choreName,
    referenceImage: { data: ref.toString('base64'), mimeType: mimeFromPath(refPath) },
    submissionImage: { data: sub.toString('base64'), mimeType: mimeFromPath(subPath) },
  };
  printVerdict(`LIVE (${client.model}): ${choreName}`, await runJudgment(client, input));
}

async function runScenarios(): Promise<void> {
  // The fake judge ignores image bytes, so placeholders are fine here.
  const input: JudgeInput = {
    choreName: 'Tidy room',
    referenceImage: { data: '<reference>', mimeType: 'image/jpeg' },
    submissionImage: { data: '<submission>', mimeType: 'image/jpeg' },
  };
  const scenarios: Array<{ label: string; judgment: ModelJudgment }> = [
    { label: 'Clean room', judgment: CLEAN_PASS },
    { label: 'Clothes on the floor', judgment: MESSY_FAIL },
    { label: 'Too dark to tell', judgment: BLURRY_UNCERTAIN },
  ];
  console.log('Running reference→verdict tracer bullet with the fake judge.');
  for (const { label, judgment } of scenarios) {
    printVerdict(label, await runJudgment(new FakeJudgeClient(judgment), input));
  }
}

async function main(): Promise<void> {
  const [refPath, subPath, choreName = 'Tidy room'] = process.argv.slice(2);
  if (refPath && subPath) {
    await runLive(refPath, subPath, choreName);
  } else {
    await runScenarios();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
