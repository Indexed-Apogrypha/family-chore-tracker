import { systemClock } from "@/adapters/clock/system";
import { fakeJudge } from "@/adapters/judge/fake";
import {
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";
import type { JudgePort } from "@/ports/judge";
import type { Ports } from "@/ports";

import { type EnvConfig, type JudgeConfig, readEnv } from "./env";
import { createServiceRoleClient } from "./supabase";

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
    case "gemini": {
      // The real provider adapters land in M4. Until then, a stub that fails
      // only when actually invoked — nothing calls the judge before M4, so
      // buildPorts() still boots with provider keys present (e.g. for the auth
      // routes, which need the member repository, not the judge).
      const provider = config.provider;
      return {
        async evaluate() {
          throw new Error(`the real '${provider}' judge adapter lands in M4`);
        },
      };
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(`unknown judge provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function buildPorts(config: EnvConfig = readEnv()): Ports {
  const judge = selectJudge(config.judge);

  if (config.persistence.kind === "supabase") {
    // M1: members persist to Supabase via the server-only service-role client.
    // The rest stay in-memory until their milestone (photos → M3; chores /
    // submissions / points → M6). The contract suite makes those swaps low-risk.
    const client = createServiceRoleClient(
      config.persistence.url,
      config.persistence.serviceRoleKey,
    );
    return {
      judge,
      clock: systemClock(),
      photos: inMemoryPhotoStorage(),
      chores: inMemoryChoreRepository(),
      submissions: inMemorySubmissionRepository(),
      members: supabaseMemberRepository(client),
      points: inMemoryPointsLedger(),
    };
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
