import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentSkeleton } from "../../src/app/components/skeleton";
import { VerificationGate } from "../../src/app/components/verification-gate";
import { VerificationWelcome } from "../../src/app/components/verification-welcome";
import { BoardTable } from "../../src/app/live-board";
import { SubmissionTable } from "../../src/app/admin/submissions/submission-table";
import type { AdminSubmissionRow } from "../../src/services/admin-submissions";
test("public pages render, navigate and fit the viewport without credentials", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Weekly LeetCode contests" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contests", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Leaderboard", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/NST LC Grind/);
  await expect(page.getByRole("link", { name: "NST LC Grind home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finish local setup" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { name: "Scoring" })).not.toBeVisible();
  await page.getByText("Contest rules", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Scoring" })).toBeVisible();
  await page.getByText("Contest rules", { exact: true }).click();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: test.info().outputPath("home.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Results", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account setup" })).toBeVisible();
  await page.goto("/results/not-a-number");
  await expect(page.getByRole("heading", { name: "Contest not found." })).toBeVisible();
  expect(errors).toEqual([]);
});

test("navigation gives immediate feedback while a route request is delayed", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === "/account" && url.searchParams.has("_rsc"), async route => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  const account = page.getByRole("link", { name: "Account", exact: true });
  try {
    await account.click();
    await expect(account.locator("[data-pending=true]")).toBeVisible({ timeout: 1500 });
    await expect(page.getByRole("link", { name: "Results", exact: true })).toBeEnabled();
  } finally { release(); }
  await expect(page.getByRole("heading", { name: "Account setup" })).toBeVisible();
  await expect(account).toHaveAttribute("aria-current", "page");
});

test("reduced motion and keyboard navigation are supported", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const results = page.getByRole("link", { name: "Results", exact: true });
  await results.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some(r => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(r.name)))).toBe(false);
});

test("account skeleton matches the layout and disables shimmer for reduced motion", async ({ page }) => {
  await page.goto("/");
  const html = renderToStaticMarkup(createElement(ContentSkeleton, { variant: "account" }));
  await page.locator("#content").evaluate((element, markup) => { element.innerHTML = markup; }, html);
  const loading = page.getByRole("status", { name: "Loading account", exact: true });
  await expect(loading).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("account-skeleton.png"), animations: "disabled" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await loading.locator(".skeleton").first().evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("none");
});

test("privacy and participation information is available without signing in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy policy", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Rules", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Participation rules", exact: true })).toBeVisible();
});

test("verification gate is readable and provides a working Account link", async ({ page }) => {
  await page.goto("/");
  const html = renderToStaticMarkup(createElement(VerificationGate, { action: createElement("a", { href: "/account", className: "button" }, "Verify LeetCode profile") }));
  await page.locator("#content").evaluate((element, markup) => { element.innerHTML = markup; }, html);
  await expect(page.getByRole("heading", { name: "Verify LeetCode to enter contests" })).toBeVisible();
  await expect(page.locator('a[href^="https://leetcode.com/problems/"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("verification-gate.png"), animations: "disabled" });
  await page.getByRole("link", { name: "Verify LeetCode profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account setup" })).toBeVisible();
});

test("welcome guide screenshots fit the modal and native keyboard focus stays inside it", async ({ page }) => {
  await page.goto("/");
  // Render the production component with an isolated member; no production
  // account changes or test-only auth bypass. React interactions are covered
  // by the UI suite; this checks real browser dialog semantics and CSS.
  const html = renderToStaticMarkup(createElement(VerificationWelcome, { member: { id: 8, leetcodeVerified: false } }));
  await page.locator("#content").evaluate((element, markup) => { element.innerHTML = markup; }, html);
  const dialog = page.locator("dialog");
  const account = page.getByRole("link", { name: "Account", exact: true });
  await account.focus();
  await dialog.evaluate((element: HTMLDialogElement) => element.showModal());
  await expect(page.getByRole("dialog", { name: "Welcome to NST LC Grind" })).toBeVisible();
  await expect(dialog.getByText("Required before entering contests")).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  for (const image of await dialog.getByRole("img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    await image.evaluate((element: HTMLImageElement) => element.decode());
    const imageBounds = await image.boundingBox();
    expect(imageBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(imageBounds!.x + imageBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  }
  await page.screenshot({ path: test.info().outputPath("verification-save-step.png"), animations: "disabled" });
  await dialog.locator(".welcome-dialog-body").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath("verification-welcome.png"), animations: "disabled" });
  const start = dialog.getByRole("link", { name: "Start verification" });
  await start.focus();
  await account.focus();
  await expect(start).toBeFocused();
  // Native dialogs may let Tab visit browser chrome (activeElement = body),
  // but must never allow focus onto the inert page behind the modal.
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate(element => document.activeElement === document.body || element.contains(document.activeElement))).toBe(true);
  }
  await start.focus();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(account).toBeFocused();
  await dialog.evaluate((element: HTMLDialogElement) => element.showModal());
  await start.click();
  await expect(page).toHaveURL(/\/account#leetcode-verification$/);
});

test("campus/year standings fit the live sidebar and expose accessible filters", async ({ page }) => {
  await page.goto("/");
  const board = createElement(BoardTable, { rows: [
    { userId: 1, rank: 1, name: "Asha", points: 18, hardsSolved: 1, campus: "sonepat", studyYear: 1 },
    { userId: 2, rank: 2, name: "Bo", points: 13.5, hardsSolved: 0, campus: "bengaluru", studyYear: 4 },
    { userId: 3, rank: 3, name: "Chen", points: 5, hardsSolved: 0, campus: "hyderabad", studyYear: 2 },
  ] });
  const html = renderToStaticMarkup(createElement("section", { className: "card leaderboard-card", style: { maxWidth: 400 } }, createElement("h2", null, "Leaderboard"), board));
  await page.locator("#content").evaluate((element, markup) => { element.innerHTML = markup; }, html);
  await expect(page.getByLabel("Filter by campus")).toBeVisible();
  await expect(page.getByLabel("Filter by year")).toBeVisible();
  await expect(page.getByText("Sonepat · 1st year", { exact: true })).toBeVisible();
  await expect(page.getByText("Bengaluru · 4th year", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const table = page.getByRole("table");
  expect(await table.evaluate(element => element.scrollWidth <= element.parentElement!.clientWidth)).toBe(true);
  await page.getByLabel("Filter by campus").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Filter by year")).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("campus-year-leaderboard.png"), animations: "disabled" });
});

test("problem-by-problem standings scroll within the viewport and keep student names visible", async ({ page }) => {
  await page.goto("/");
  const startsAt = "2026-10-17T10:00:00.000Z";
  const board = createElement(BoardTable, {
    rows: [{ userId: 1, rank: 1, name: "Asha", points: 3, hardsSolved: 0, campus: "pune", studyYear: 2, solves: [{ problemId: 1, points: 3, multiplier: 1.5, source: "auto", acceptedAt: "2026-10-17T10:10:00.000Z", verifiedAt: "2026-10-17T10:30:00.000Z" }] }],
    details: { startsAt, problems: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, label: `B${Math.floor(i / 4) + 1}.${"ABCD"[i % 4]}`, batchPosition: Math.floor(i / 4), problem: i < 8 ? { title: `Example problem ${i + 1}`, slug: `example-${i + 1}`, difficulty: "easy" as const, points: 2 } : null })) },
  });
  const html = renderToStaticMarkup(createElement("section", { className: "card leaderboard-card" }, createElement("h2", null, "Problem-by-problem standings"), board));
  await page.locator("#content").evaluate((element, markup) => { element.innerHTML = markup; }, html);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText("+00:10:00", { exact: true })).toBeVisible();
  await expect(page.getByText("3:40:00 PM IST", { exact: true })).toBeVisible();
  const region = page.getByRole("region", { name: "Problem-by-problem standings; scroll to see every batch" });
  await region.focus();
  await expect(region).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("detailed-leaderboard.png"), animations: "disabled" });
  await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByText("B3.D", { exact: true })).toBeInViewport();
  await expect(page.getByText("Asha", { exact: true })).toBeInViewport();
  expect(await page.locator('a[href*="example-9"]').count()).toBe(0);
  await page.screenshot({ path: test.info().outputPath("detailed-leaderboard-scrolled.png"), animations: "disabled" });
});

test("admin submission records show links and both timestamps without overflowing the page", async ({ page }) => {
  await page.goto("/");
  const row: AdminSubmissionRow = {
    id: 1, userId: 1, name: "Example student", email: "student@example.test", leetcodeUsername: "example-student",
    contestId: 1, contestTitle: "Saturday Sprint", problemId: 1, problemTitle: "Example problem", slug: "example-problem", batchPosition: 0,
    submissionId: "123456", submissionUrl: "https://leetcode.com/submissions/detail/123456/",
    acceptedAt: new Date("2026-10-17T10:10:00Z"), verifiedAt: new Date("2026-10-17T10:30:00Z"),
    points: 3, multiplier: 1.5, status: "valid", source: "auto", disqualified: false, evidenceUrl: null,
  };
  const html = renderToStaticMarkup(createElement("section", { className: "card" }, createElement("h2", null, "Student submissions"), createElement(SubmissionTable, { rows: [row, { ...row, id: 2, source: "manual", status: "revoked", disqualified: true, submissionId: null, submissionUrl: null, evidenceUrl: "https://example.com/proof" }] })));
  await page.locator("#content").evaluate((element, markup) => { element.innerHTML = markup; }, html);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "Open submission #123456" })).toHaveAttribute("href", "https://leetcode.com/submissions/detail/123456/");
  expect(await page.locator('time[datetime="2026-10-17T10:10:00.000Z"]').count()).toBe(2);
  expect(await page.locator('time[datetime="2026-10-17T10:30:00.000Z"]').count()).toBe(2);
  const region = page.getByRole("region", { name: "Student submission records" });
  await region.focus(); await expect(region).toBeFocused();
  await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByText("Revoked", { exact: true })).toBeInViewport();
  await expect(page.getByRole("link", { name: "View evidence" })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("admin-submissions.png"), animations: "disabled" });
});
