import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = resolve("../../docs/qa/website");

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*posthog\.com\//, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: "{}",
    }),
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`marketing and docs work at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("PostgreSQL");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.getByText("Can I download Rowberry yet?", { exact: true }).click();
    await expect(
      page.getByText("A signed public release is not ready yet", { exact: false }),
    ).toBeVisible();
    await page.getByText("Can I download Rowberry yet?", { exact: true }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: resolve(evidence, `home-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Get started", exact: false }).first().click();
    await expect(page).toHaveURL(/\/docs\/getting-started\/$/);
    await expect(page.getByRole("heading", { name: /^Get started/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: resolve(evidence, `docs-${viewport.width}.png`),
      fullPage: true,
    });
    await page.locator('label[for="__palette_1"]').click();
    await expect(page.locator("body")).toHaveAttribute("data-md-color-scheme", "slate");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: resolve(evidence, `docs-dark-${viewport.width}.png`),
      fullPage: true,
    });
    if (viewport.width < 800) {
      await page.locator('.md-header label[for="__drawer"]').click();
      await page
        .getByRole("navigation", { name: "Navigation", exact: true })
        .getByRole("link", { name: "Work with JSON", exact: true })
        .click();
      await expect(page.getByRole("heading", { name: /^Work with JSON/ })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("docs search finds a workflow, handles no results, and follows a result", async ({ page }) => {
  await page.goto("/docs/");
  const search = page.getByRole("textbox", { name: "Search", exact: true });
  await expect(page.locator(".md-search-result__meta")).toHaveText("Type to start searching");
  await search.pressSequentially("optimistic");
  await expect(page.locator(".md-search-result__list")).toContainText("conflict");
  await search.fill("");
  await search.pressSequentially("zzznomatchingrowberrydocument");
  await expect(page.locator(".md-search-result__meta")).toHaveText("No matching documents");
  await search.fill("");
  await search.pressSequentially("JSON");
  await page
    .locator(".md-search-result__link")
    .filter({ hasText: "Work with JSON" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/docs\/json\//);
  await expect(page.getByRole("heading", { name: /^Work with JSON/ })).toBeVisible();
});

test("published routes, local links and assets resolve with real content", async ({ request }) => {
  const paths = [
    "/",
    "/docs/",
    "/docs/getting-started/",
    "/docs/connections/",
    "/docs/tables/",
    "/docs/sql/",
    "/docs/json/",
    "/docs/recovery/",
    "/docs/security/",
    "/docs/troubleshooting/",
    "/docs/status/",
  ];
  const assets = new Set<string>();
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html, path).toMatch(/<h1[ >]/);
    for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      const url = new URL(match[1]!, `http://local${path}`);
      if (url.origin === "http://local") assets.add(url.pathname);
    }
  }
  for (const path of assets) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    if (/\.(png|svg|js|css|ttf)$/.test(path))
      expect(response.headers()["content-type"], path).not.toContain("text/html");
  }
  const missing = await request.get("/does-not-exist");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("Back to Rowberry");
  const missingDocs = await request.get("/docs/does-not-exist/");
  expect(missingDocs.status()).toBe(404);
});
