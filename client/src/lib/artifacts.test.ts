import { describe, expect, it } from "vitest";

type Artifact = { id: number; name: string; fileType: string; storageUrl: string };

function hydrateArtifacts(existing: Artifact[], incoming: Artifact[]): Artifact[] {
  const map = new Map<number, Artifact>();
  existing.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

describe("artifact hydration and persistence", () => {
  it("retains existing artifacts when task detail is refetched", () => {
    const existing = [{ id: 1, name: "Report.pdf", fileType: "pdf", storageUrl: "/manus-storage/report.pdf" }];
    const incoming = [{ id: 2, name: "Dataset.csv", fileType: "csv", storageUrl: "/manus-storage/dataset.csv" }];

    const result = hydrateArtifacts(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(["Report.pdf", "Dataset.csv"]);
  });
});
