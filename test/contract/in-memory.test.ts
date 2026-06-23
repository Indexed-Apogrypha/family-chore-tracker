import { systemClock } from "@/adapters/clock/system";
import { fakeJudge } from "@/adapters/judge/fake";
import {
  createInMemoryStore,
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";

import { runChoreRepositoryContract } from "./chore-repository.contract";
import { runClockContract } from "./clock.contract";
import type { RepoHarness } from "./harness";
import { runJudgeContract } from "./judge.contract";
import { runMemberRepositoryContract } from "./member-repository.contract";
import { runPhotoStorageContract } from "./photo-storage.contract";
import { runPointsLedgerContract } from "./points-ledger.contract";
import { runSubmissionRepositoryContract } from "./submission-repository.contract";

// The in-memory/fake adapters are the executable spec — they must pass every
// seam contract (design §5, §10). The Supabase adapters run through these SAME
// suites (test/contract/*.supabase.test.ts) once a test database exists.

// One shared store per harness so the chore + submission repos observe each
// other's writes (the atomic advance, §7.2) — mirroring the single Supabase DB.
function inMemoryHarness(): RepoHarness {
  const store = createInMemoryStore();
  return {
    members: inMemoryMemberRepository(),
    chores: inMemoryChoreRepository(store),
    submissions: inMemorySubmissionRepository(store),
    points: inMemoryPointsLedger(),
  };
}

runClockContract("systemClock", systemClock);
runJudgeContract("fakeJudge", fakeJudge);
runPhotoStorageContract("inMemoryPhotoStorage", inMemoryPhotoStorage);
runMemberRepositoryContract("inMemoryMemberRepository", inMemoryMemberRepository);
runChoreRepositoryContract("inMemory", inMemoryHarness);
runSubmissionRepositoryContract("inMemory", inMemoryHarness);
runPointsLedgerContract("inMemory", inMemoryHarness);
