import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

import { systemClock } from "@/adapters/clock/system";
import { anthropicJudge } from "@/adapters/judge/anthropic";
import { fakeJudge } from "@/adapters/judge/fake";
import { geminiJudge } from "@/adapters/judge/gemini";
import {
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
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
    // Members + photos persist to Supabase (M1, M3); chores / submissions /
    // points stay in-memory until M6. The contract suites make the swap low-risk.
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
      chores: inMemoryChoreRepository(),
      submissions: inMemorySubmissionRepository(),
      members: supabaseMemberRepository(client),
      points: inMemoryPointsLedger(),
    };
  }

  const photos = inMemoryPhotoStorage();
  return {
    judge: selectJudge(config.judge, photos),
    clock: systemClock(),
    photos,
    chores: inMemoryChoreRepository(),
    submissions: inMemorySubmissionRepository(),
    members: inMemoryMemberRepository(),
    points: inMemoryPointsLedger(),
  };
}
