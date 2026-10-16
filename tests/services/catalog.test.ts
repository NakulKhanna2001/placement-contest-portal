import { afterEach, expect, it, vi } from "vitest";
const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db", () => ({ getDb }));
// Next's persistent cache serializes database values through JSON. Exercise a
// cache hit, rather than relying on the driver's cold-read Date instances.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => Promise<unknown>) => async () => JSON.parse(JSON.stringify(await fn())) }));
import { closeTestDbs } from "@/db/test-db";
import { getContestCatalog } from "@/services/contest-catalog";
import { createContest } from "@/services/contest";
import { at, batch, setup, start } from "../helpers";
afterEach(closeTestDbs);
it("keeps cached scheduling timestamps usable and excludes draft contests", async () => {
  const { db, contestId } = await setup();
  getDb.mockReturnValue(db);
  await createContest(db, { title: "Private draft", startsAt: at(300), batches: [batch(8)], status: "draft" });
  const catalog = await getContestCatalog();
  expect(catalog).toHaveLength(1);
  expect(catalog[0].id).toBe(contestId);
  expect(catalog[0].startsAt).toBeInstanceOf(Date);
  expect(catalog[0].startsAt.toISOString()).toBe(start.toISOString());
  expect(catalog[0].endsAt).toBeInstanceOf(Date);
  expect(catalog.find(c => c.startsAt <= at(10) && c.endsAt >= at(10))?.id).toBe(contestId);
});
