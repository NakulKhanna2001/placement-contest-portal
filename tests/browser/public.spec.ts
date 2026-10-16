import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentSkeleton } from "../../src/app/components/skeleton";
import { VerificationGate } from "../../src/app/components/verification-gate";
test("public pages render, navigate and fit the viewport without credentials", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Weekly LeetCode contests" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contests", exact: true })).toBeVisible();
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
