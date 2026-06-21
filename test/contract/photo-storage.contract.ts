import { describe, expect, it } from "vitest";

import { familyId, instanceId, submissionId } from "@/domain/shared/ids";
import type { PhotoMeta, PhotoStorage } from "@/ports/photo-storage";

const meta = (contentType = "image/jpeg"): PhotoMeta => ({
  familyId: familyId("f1"),
  instanceId: instanceId("i1"),
  submissionId: submissionId("s1"),
  contentType,
});

/**
 * The PhotoStorage contract (design §5, §9). The path scheme is part of the
 * contract; the signed-URL format is adapter-specific, so only its shape (a
 * non-empty string) is asserted here.
 */
export function runPhotoStorageContract(
  label: string,
  makeStorage: () => PhotoStorage,
): void {
  describe(`PhotoStorage contract — ${label}`, () => {
    it("stores bytes at the family/instance/submission path", async () => {
      const ref = await makeStorage().put(new Uint8Array([1, 2, 3]), meta());
      expect(ref.path).toBe("f1/i1/s1.jpg");
    });

    it("derives the file extension from the content type", async () => {
      const ref = await makeStorage().put(new Uint8Array([1]), meta("image/png"));
      expect(ref.path).toBe("f1/i1/s1.png");
    });

    it("signs a non-empty url for a stored ref", async () => {
      const storage = makeStorage();
      const ref = await storage.put(new Uint8Array([1]), meta());
      const url = await storage.signedUrl(ref);
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });
  });
}
