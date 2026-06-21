import { systemClock } from "@/adapters/clock/system";
import { fakeJudge } from "@/adapters/judge/fake";
import {
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";

import { runChoreRepositoryContract } from "./chore-repository.contract";
import { runClockContract } from "./clock.contract";
import { runJudgeContract } from "./judge.contract";
import { runMemberRepositoryContract } from "./member-repository.contract";
import { runPhotoStorageContract } from "./photo-storage.contract";
import { runPointsLedgerContract } from "./points-ledger.contract";
import { runSubmissionRepositoryContract } from "./submission-repository.contract";

// The in-memory/fake adapters are the executable spec — they must pass every
// seam contract (design §5, §10). The Supabase adapters run through these same
// suites once a test database exists (storage in M3, persistence in M6).
runClockContract("systemClock", systemClock);
runJudgeContract("fakeJudge", fakeJudge);
runPhotoStorageContract("inMemoryPhotoStorage", inMemoryPhotoStorage);
runMemberRepositoryContract("inMemoryMemberRepository", inMemoryMemberRepository);
runSubmissionRepositoryContract(
  "inMemorySubmissionRepository",
  inMemorySubmissionRepository,
);
runChoreRepositoryContract("inMemoryChoreRepository", inMemoryChoreRepository);
runPointsLedgerContract("inMemoryPointsLedger", inMemoryPointsLedger);
