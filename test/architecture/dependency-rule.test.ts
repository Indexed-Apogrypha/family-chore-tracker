import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Guard test for the dependency rule (design §4.1): the composition root is the
// only place that reads the environment or imports an adapter. This scans the
// source tree so a future violation fails CI rather than silently eroding the
// architecture. (This test lives under test/, so it never scans itself.)
const SRC = join(process.cwd(), "src");
const norm = (path: string) => path.replace(/\\/g, "/");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("architecture invariants (design §4.1)", () => {
  const files = sourceFiles(SRC);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("only composition/ reads the environment", () => {
    const offenders = files
      .filter((f) => !norm(f).includes("/composition/"))
      .filter((f) => readFileSync(f, "utf8").includes("process.env"))
      .map(norm);
    expect(offenders).toEqual([]);
  });

  it("only adapters/ and composition/ import an adapter", () => {
    const offenders = files
      .filter((f) => {
        const n = norm(f);
        return !n.includes("/src/adapters/") && !n.includes("/src/composition/");
      })
      .filter((f) => /from\s+["']@\/adapters\//.test(readFileSync(f, "utf8")))
      .map(norm);
    expect(offenders).toEqual([]);
  });
});
