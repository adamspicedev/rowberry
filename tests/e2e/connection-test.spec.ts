import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";

for (const failure of ["unavailable", "save-fallback"] as const) {
  test(`session-only password warning survives Connect when storage is ${failure}`, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "rowberry-session-password-"));
    const fixture = JSON.parse(
      readFileSync(process.env.DBAPP_POSTGRES_FIXTURES ?? "/tmp/dbapp-task3-fixtures.json", "utf8"),
    );
    const launch = () =>
      electron.launch({
        executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
        args: [
          ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
          `--user-data-dir=${directory}`,
        ],
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await expect(page.locator("[data-app-ready]")).toBeVisible();
      // Control capability/fallback at the bridge so this UI regression also runs
      // on CI without an OS vault. Keep the real service's transient-secret path
      // and PostgreSQL authentication. Native denied writes require separate QA.
      await app.evaluate(({ ipcMain }, failure) => {
        const handlers = Reflect.get(ipcMain, "_invokeHandlers") as Map<
          string,
          (...args: unknown[]) => Promise<unknown>
        >;
        const original = handlers.get("dbapp:request");
        if (!original) throw new Error("Missing application IPC handler");
        ipcMain.removeHandler("dbapp:request");
        ipcMain.handle("dbapp:request", async (event, command) => {
          if (command.kind === "connections.submitSecret") {
            if (command.persist !== (failure === "save-fallback"))
              throw new Error("Unexpected password persistence choice");
            return original(event, { ...command, persist: false });
          }
          const reply = await original(event, command);
          if (command.kind === "connections.list" && reply && typeof reply === "object") {
            const result = reply as { ok: boolean; data: { secureStorage: boolean } };
            if (result.ok) result.data.secureStorage = failure === "save-fallback";
          }
          return reply;
        });
      }, failure);
      await page.reload();
      await page.getByRole("button", { name: "New connection", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Session fallback");
      await page.getByLabel("Port", { exact: true }).fill("55418");
      await page.getByLabel("Database", { exact: true }).fill("fixture");
      await page.getByLabel("User", { exact: true }).fill("fixture");
      await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
      const persist = page.getByRole("checkbox", { name: "Save password in OS credential store" });
      if (failure === "save-fallback") await expect(persist).toBeChecked();
      else await expect(persist).toBeDisabled();
      await page.getByText("SSL settings", { exact: false }).click();
      await page
        .getByLabel("CA certificate", { exact: true })
        .fill(path.join(fixture.directory, "ca.crt"));
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(page.locator(".connection-state")).toHaveText("connected");
      const warning = page.locator(".toast").getByRole("alert");
      await expect(warning).toHaveText(
        "Password for Session fallback is session-only and will be forgotten when the app quits.",
      );
      await page.clock.install();
      await page.clock.fastForward(8000);
      await expect(warning).toBeVisible();
      await page.getByRole("button", { name: /^Dismiss Password for Session fallback/ }).click();
      await expect(warning).toHaveCount(0);
      await app.close();
      for (const file of readdirSync(directory).filter((file) =>
        file.startsWith("profiles.sqlite"),
      ))
        expect(
          readFileSync(path.join(directory, file)).includes(Buffer.from("fixture-only-password")),
        ).toBe(false);
      app = await launch();
      page = await app.firstWindow();
      await page.getByRole("button", { name: "Select Session fallback", exact: true }).click();
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(page.locator(".connection-message")).toContainText("Database connection failed");
      await expect(page.locator(".connection-state")).toHaveText("disconnected");
    } finally {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      );
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

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
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCSS(
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
