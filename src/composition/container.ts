import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

import { systemClock } from "@/adapters/clock/system";
import { anthropicJudge } from "@/adapters/judge/anthropic";
import { fakeJudge } from "@/adapters/judge/fake";
import { geminiJudge } from "@/adapters/judge/gemini";
import {
  createInMemoryStore,
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { supabaseChoreRepository } from "@/adapters/persistence/supabase/chores";
import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
import { supabasePointsLedger } from "@/adapters/persistence/supabase/points-ledger";
import { supabaseSubmissionRepository } from "@/adapters/persistence/supabase/submissions";
import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";
import { supabasePhotoStorage } from "@/adapters/storage/supabase";
import type { JudgePort } from "@/ports/judge";
import type { PhotoStorage } from "@/ports/photo-storage";
import type { Ports } from "@/ports";

import { type EnvConfig, type JudgeConfig, readEnv } from "./env";
import { createServiceRoleClient } from "./supabase";

/**
 * The composition root: the only place that imports adapters and turns the
 * env-selected config into a live `Ports` bundle (design §4.1, §5).
 *
 * Judge precedence (§5) is decided in `env.ts`; here we wire the chosen provider.
 * The real judges need to *see* the photo, so they're built with a resolver over
 * the selected `PhotoStorage` (signed URL). Infra faults from a real judge throw
 * on `evaluate`, which the `submitPhoto` use-case maps to `judge_unavailable`.
 */
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function selectJudge(config: JudgeConfig, photos: PhotoStorage): JudgePort {
  // Real judges read the photo via a short-lived signed URL from the active store.
  const resolveImageUrl = (photo: Parameters<PhotoStorage["signedUrl"]>[0]) =>
    photos.signedUrl(photo);

  switch (config.provider) {
    case "fake":
      return fakeJudge();
    case "anthropic":
      return anthropicJudge({
        client: new Anthropic({ apiKey: config.apiKey }),
        model: config.model ?? DEFAULT_ANTHROPIC_MODEL,
        resolveImageUrl,
      });
    case "gemini":
      return geminiJudge({
        client: new GoogleGenAI({ apiKey: config.apiKey }),
        model: config.model ?? DEFAULT_GEMINI_MODEL,
        resolveImageUrl,
      });
    default: {
      const _exhaustive: never = config;
      throw new Error(`unknown judge provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function buildPorts(config: EnvConfig = readEnv()): Ports {
  if (config.persistence.kind === "supabase") {
    // Real mode: every seam persists to Supabase via the server-only service-role
    // client (members M1, photos M3, chores/submissions/points M6). The shared
    // contract suites proved the adapters interchangeable with the in-memory spec.
    const client = createServiceRoleClient(
      config.persistence.url,
      config.persistence.serviceRoleKey,
    );
    const photos = supabasePhotoStorage(
      client,
      config.persistence.bucket ?? "chore-photos",
    );
    return {
      judge: selectJudge(config.judge, photos),
      clock: systemClock(),
      photos,
      chores: supabaseChoreRepository(client),
      submissions: supabaseSubmissionRepository(client),
      members: supabaseMemberRepository(client),
      points: supabasePointsLedger(client),
    };
  }

  // A real judge needs a fetchable photo URL, but in-memory storage mints
  // `memory://` URLs no vision API can read — so that combination would fail
  // opaquely (`judge_unavailable`) on every submission. Reject it loudly.
  if (config.judge.provider !== "fake") {
    throw new Error(
      `the '${config.judge.provider}' judge requires Supabase storage — in-memory ` +
        "photos produce memory:// URLs the vision API can't fetch. Set SUPABASE_URL " +
        "+ SUPABASE_SERVICE_ROLE_KEY, or unset the judge key to use the fake judge.",
    );
  }

  const photos = inMemoryPhotoStorage();
  // One shared store so the chore, submission, and points repos observe each
  // other's writes (the atomic `recordVerdictAndAdvance` §7.2 and
  // `recordDecisionAndAdvance` §7.1/#136) — like the single Supabase DB.
  const store = createInMemoryStore();
  return {
    judge: selectJudge(config.judge, photos),
    clock: systemClock(),
    photos,
    chores: inMemoryChoreRepository(store),
    submissions: inMemorySubmissionRepository(store),
    members: inMemoryMemberRepository(),
    points: inMemoryPointsLedger(store),
  };
}
