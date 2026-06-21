// The four seams plus the request context. Adapters live behind these; only the
// composition root wires concrete adapters to them (design §4.1, §5).
export * from "./clock";
export * from "./photo-storage";
export * from "./judge";
export * from "./context";
export * from "./repositories";

import type { Clock } from "./clock";
import type { JudgePort } from "./judge";
import type { PhotoStorage } from "./photo-storage";
import type {
  ChoreRepository,
  MemberRepository,
  PointsLedger,
  SubmissionRepository,
} from "./repositories";

/**
 * The full set of seams a use-case depends on, assembled once at the
 * composition root and threaded through `makeApp(ports)` (design §4.2).
 */
export interface Ports {
  judge: JudgePort;
  photos: PhotoStorage;
  clock: Clock;
  chores: ChoreRepository;
  submissions: SubmissionRepository;
  members: MemberRepository;
  points: PointsLedger;
}
