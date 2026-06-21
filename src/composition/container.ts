import { systemClock } from "@/adapters/clock/system";
import { fakeJudge } from "@/adapters/judge/fake";
import {
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";
import type { JudgePort } from "@/ports/judge";
import type { Ports } from "@/ports";

import { type EnvConfig, type JudgeConfig, readEnv } from "./env";

/**
 * The composition root: the only place that imports adapters and turns the
 * env-selected config into a live `Ports` bundle (design §4.1, §5). In M0 only
 * the keyless stack exists; the real adapters throw a clear "lands in M{n}"
 * error until their milestone wires them in.
 */
function selectJudge(config: JudgeConfig): JudgePort {
  switch (config.provider) {
    case "fake":
      return fakeJudge();
    case "anthropic":
    case "gemini":
      throw new Error(
        `the real '${config.provider}' judge adapter lands in M4`,
      );
    default: {
      const _exhaustive: never = config;
      throw new Error(`unknown judge provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function buildPorts(config: EnvConfig = readEnv()): Ports {
  const judge = selectJudge(config.judge);

  if (config.persistence.kind === "supabase") {
    throw new Error(
      "Supabase persistence/storage adapters land in M1/M3/M6; keyless only in M0",
    );
  }

  return {
    judge,
    clock: systemClock(),
    photos: inMemoryPhotoStorage(),
    chores: inMemoryChoreRepository(),
    submissions: inMemorySubmissionRepository(),
    members: inMemoryMemberRepository(),
    points: inMemoryPointsLedger(),
  };
}
