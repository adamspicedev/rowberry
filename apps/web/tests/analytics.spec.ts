import { test, expect } from "@playwright/test";
import { gunzipSync } from "node:zlib";

// PostHog deliberately filters HeadlessChrome as bot traffic.
test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});

test("marketing conversion and docs pageviews are captured once without replay", async ({
  page,
  context,
}) => {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  await context.route(/https:\/\/[^/]*posthog\.com\//, async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    if (body && new URL(request.url()).pathname.includes("/e")) {
      let json =
        body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body).toString() : body.toString();
      if (json.startsWith("data=")) {
        json = Buffer.from(new URLSearchParams(json).get("data")!, "base64").toString();
      }
      const payload = JSON.parse(json);
      events.push(...(payload.batch ?? (Array.isArray(payload) ? payload : [payload])));
    }
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  await page.goto("/");
  await expect
    .poll(() => events.filter((event) => event.event === "$pageview").length, { timeout: 15000 })
    .toBe(1);
  await page.getByRole("link", { name: "Get started", exact: false }).first().click();
  await expect(page).toHaveURL(/\/docs\/getting-started\/$/);
  await expect
    .poll(() => events.filter((event) => event.event === "getting_started_clicked").length, {
      timeout: 15000,
    })
    .toBe(1);
  await expect
    .poll(() => events.filter((event) => event.event === "$pageview").length, { timeout: 15000 })
    .toBe(2);
  expect(
    events.find((event) => event.event === "getting_started_clicked")?.properties.location,
  ).toBe("hero");
  expect(
    events.some((event) => ["$autocapture", "$snapshot", "$identify"].includes(event.event)),
  ).toBe(false);
});
