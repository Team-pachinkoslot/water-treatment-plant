import { describe, expect, it } from "vitest";
import { CITY_NAME, getLab, labs, stages } from "../src/lib/labs";
import { runtimeProvider } from "../src/lib/runtime";
import { GET as health } from "../src/app/api/health/route";
import { GET as list } from "../src/app/api/labs/route";
import { GET as detail } from "../src/app/api/labs/[slug]/route";

describe("Phase 1 catalog contract", () => {
  it("keeps the agreed three stable IDs and slugs", () => {
    expect(labs.map(({ id, slug }) => [id, slug])).toEqual([
      ["water-01", "water-treatment"],
      ["power-01", "power-substation"],
      ["rail-01", "railway-operations"],
    ]);
  });
  it("uses the requested fictional city for every facility", () => {
    expect(CITY_NAME).toBe("七王子市");
    for (const lab of labs) expect(lab.subtitle).toContain(CITY_NAME);
  });
  it("does not advertise an available exercise or runtime", () => {
    for (const lab of labs) expect(lab.status).toBe("coming_soon");
    expect(runtimeProvider).toMatchObject({
      mode: "disabled",
      connected: false,
    });
    expect(Object.isFrozen(runtimeProvider)).toBe(true);
  });
  it("preserves the five ordered AQUA stages without flag answers", () => {
    expect(stages.map(({ title }) => title)).toEqual([
      "偵察",
      "Web調査",
      "情報発見",
      "内部調査",
      "証拠回収",
    ]);
    expect(JSON.stringify({ labs, stages })).not.toMatch(
      /(?:FLAG|flag)\{[^}]+\}/,
    );
  });
  it("does not resolve arbitrary IDs, traversal paths, or inherited properties", () => {
    for (const slug of [
      "water-01",
      "../water-treatment",
      "__proto__",
      "constructor",
      "unknown",
    ])
      expect(getLab(slug)).toBeUndefined();
  });
});

describe("read-only mock API", () => {
  it("reports application health separately from disabled VM runtime", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      phase: 1,
      dataSource: "mock",
      runtime: { mode: "disabled", connected: false },
    });
  });
  it("returns exactly the three mock labs", async () => {
    const response = list();
    expect(response.headers.get("content-type")).toContain("application/json");
    const data = await response.json();
    expect(data.total).toBe(3);
    expect(data.labs).toEqual(labs);
    expect(data.dataSource).toBe("mock");
  });
  it.each(labs)("returns the same contract for $slug", async (lab) => {
    const response = await detail(
      new Request(`http://localhost/api/labs/${lab.slug}`),
      { params: Promise.resolve({ slug: lab.slug }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      lab,
      dataSource: "mock",
      runtime: { mode: "disabled", connected: false },
    });
  });
  it("returns a structured 404 for an unknown slug", async () => {
    const response = await detail(
      new Request("http://localhost/api/labs/missing"),
      { params: Promise.resolve({ slug: "missing" }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "LAB_NOT_FOUND" },
    });
  });
});
