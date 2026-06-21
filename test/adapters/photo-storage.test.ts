import { describe, expect, it } from "vitest";

import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";
import { familyId, instanceId, submissionId } from "@/domain/shared/ids";
import type { PhotoMeta } from "@/ports/photo-storage";

const meta = (contentType = "image/jpeg"): PhotoMeta => ({
  familyId: familyId("f1"),
  instanceId: instanceId("i1"),
  submissionId: submissionId("s1"),
  contentType,
});

describe("inMemoryPhotoStorage", () => {
  it("stores bytes at the family/instance/submission path (§9)", async () => {
    const storage = inMemoryPhotoStorage();
    const ref = await storage.put(new Uint8Array([1, 2, 3]), meta());
    expect(ref.path).toBe("f1/i1/s1.jpg");
  });

  it("derives the file extension from the content type", async () => {
    const storage = inMemoryPhotoStorage();
    const png = await storage.put(new Uint8Array([1]), meta("image/png"));
    expect(png.path).toBe("f1/i1/s1.png");
  });

  it("signs a url that references the stored path", async () => {
    const storage = inMemoryPhotoStorage();
    const ref = await storage.put(new Uint8Array([1]), meta());
    expect(await storage.signedUrl(ref)).toContain("f1/i1/s1.jpg");
  });
});
