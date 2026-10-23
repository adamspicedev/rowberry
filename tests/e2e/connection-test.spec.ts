import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";

test("connection test leaves metadata and active workspace untouched", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-connect-test-"));
  const app = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
  });
  try {
    const page = await app.firstWindow();
    const request = async (command: Record<string, unknown>) =>
      ReplySchema.parse(
        await page.evaluate(
          (command) =>
            Reflect.apply(window.dbapp.request, window.dbapp, [
              { ...command, requestId: crypto.randomUUID() },
            ]),
          command,
        ),
      );
    const id = crypto.randomUUID();
    await request({
      kind: "connections.save",
      profile: {
        id,
        name: "Existing",
        host: "localhost",
        port: 55418,
        database: "fixture",
        user: "fixture",
        tls: { kind: "disable", acknowledged: true },
        environmentColor: "#7c3aed",
      },
    });
    await request({
      kind: "connections.submitSecret",
      id,
      secret: "fixture-only-password",
      persist: false,
    });
    const connected = await request({ kind: "connections.connect", id });
    if (!connected.ok || connected.kind !== "connections.connect")
      throw Error("No fixture session");
    await page.getByRole("button", { name: "New connection", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Local development");
    await page.getByLabel("Port", { exact: true }).fill("55418");
    await page.getByLabel("Database", { exact: true }).fill("fixture");
    await page.getByLabel("User", { exact: true }).fill("fixture");
    await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
    await page.getByText("SSL settings", { exact: false }).click();
    await page.getByLabel("TLS", { exact: true }).selectOption("disable");
    await page.getByLabel("I understand this connection's risk").check();
    await page.getByRole("button", { name: "Test connection", exact: true }).click();
    await expect(page.getByText(/Connected successfully/)).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("fixture-only-password");
    const profiles = await request({ kind: "connections.list", offset: 0 });
    expect(profiles).toMatchObject({ ok: true, data: { profiles: [{ name: "Existing" }] } });
    expect(
      (
        await request({
          kind: "schema.list",
          sessionId: connected.data.sessionId,
          generation: connected.data.generation,
        })
      ).ok,
    ).toBe(true);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setSize(1440, 1040),
    );
    await page.getByText("SSL settings", { exact: false }).click();
    await page
      .getByRole("heading", { name: "New connection", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/rowberry-connection-light.png", animations: "disabled" });
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
    await expect(page.getByRole("button", { name: "Save connection", exact: true })).toHaveCSS(
      "color",
      "rgb(228, 231, 236)",
    );
    await page.screenshot({ path: "/tmp/rowberry-connection-dark.png", animations: "disabled" });
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await expect(page.getByText(/Connected successfully/)).toHaveCount(0);
    await page.getByRole("button", { name: "Test connection", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Could not connect");
    expect(
      (
        await request({
          kind: "schema.list",
          sessionId: connected.data.sessionId,
          generation: connected.data.generation,
        })
      ).ok,
    ).toBe(true);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
