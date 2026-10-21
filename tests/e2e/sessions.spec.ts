import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { createServer, type Socket } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";
import { Client } from "pg";
import { ConnectionProfileSchema } from "../../src/shared/protocol";
const fixture = z
  .object({ directory: z.string() })
  .parse(
    JSON.parse(
      readFileSync(process.env.DBAPP_POSTGRES_FIXTURES ?? "/tmp/dbapp-task3-fixtures.json", "utf8"),
    ),
  );
test("saved metadata and private transient password open a real TLS session from Connect", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "dbapp-session-ui-"));
  const application = await electron.launch({
    args: [path.resolve("."), `--user-data-dir=${userData}`],
  });
  try {
    const page = await application.firstWindow();
    const profile = ConnectionProfileSchema.parse({
      id: crypto.randomUUID(),
      name: "Live fixture",
      host: "localhost",
      port: 55418,
      user: "fixture",
      database: "fixture",
      tls: { kind: "verify-full", caPath: path.join(fixture.directory, "ca.crt") },
      environmentColor: "#123456",
    });
    const replies = await page.evaluate(async (profile) => {
      const requestId = "session-ui";
      const saved = await Reflect.apply(window.dbapp.request, window.dbapp, [
        { kind: "connections.save", requestId, profile },
      ]);
      const secret = await Reflect.apply(window.dbapp.request, window.dbapp, [
        {
          kind: "connections.submitSecret",
          requestId,
          id: profile.id,
          secret: "fixture-only-password",
          persist: false,
        },
      ]);
      return { saved, secret };
    }, profile);
    expect(replies.saved.ok).toBe(true);
    expect(replies.secret).toMatchObject({ ok: true, data: { storage: "session" } });
    expect(JSON.stringify(replies)).not.toContain("fixture-only-password");
    await page.reload();
    await page.evaluate(() => {
      const events: unknown[] = [];
      Reflect.set(window, "sessionEvents", events);
      window.dbapp.subscribe((event) => events.push(event));
    });
    await page.getByRole("button", { name: "Connect Live fixture", exact: true }).click();
    await expect(page.locator(".connection-state")).toHaveText("connected");
    await expect(page.getByText("Database connected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.locator(".connection-state")).toHaveText("disconnected");
    expect(
      readFileSync(path.join(userData, "profiles.sqlite")).includes(
        Buffer.from("fixture-only-password"),
      ),
    ).toBe(false);
    const result = await page.evaluate(
      async (id) =>
        Reflect.apply(window.dbapp.request, window.dbapp, [
          { kind: "sessions.open", requestId: "reopen", profileId: id },
        ]),
      profile.id,
    );
    expect(result).toMatchObject({
      ok: true,
      kind: "sessions.open",
      data: { serverVersion: expect.stringMatching(/^18\./) },
    });
    expect(JSON.stringify(result)).not.toContain("fixture-only-password");
    const oldEvent = await page.evaluate(() => {
      const events: unknown = Reflect.get(window, "sessionEvents");
      if (!Array.isArray(events)) throw new Error();
      return events[0];
    });
    await page.evaluate(() => {
      Reflect.set(window, "staleSeen", false);
      window.dbapp.subscribe((event) => {
        if (event.kind === "sessions.state" && event.state === "disconnected")
          Reflect.set(window, "staleSeen", true);
      });
    });
    await application.evaluate(({ BrowserWindow }, oldEvent) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || typeof oldEvent !== "object" || oldEvent === null) throw new Error();
      window.webContents.send("dbapp:event", { ...oldEvent, state: "disconnected" });
    }, oldEvent);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "staleSeen"))).toBe(true);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(page.locator(".connection-state")).toHaveText("connected");

    if (!result.ok || result.kind !== "sessions.open") throw new Error();
    const closed = await page.evaluate(
      async (sessionId) =>
        Reflect.apply(window.dbapp.request, window.dbapp, [
          { kind: "sessions.close", requestId: "close", sessionId },
        ]),
      result.data.sessionId,
    );
    expect(closed).toMatchObject({ ok: true, kind: "sessions.close" });
  } finally {
    await application.close();
    rmSync(userData, { recursive: true, force: true });
  }
});

for (const action of ["Disconnect", "Reload"])
  test(`${action} closes a pending main-bridge connection handshake`, async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.resume();
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error();
    const userData = mkdtempSync(path.join(tmpdir(), "dbapp-pending-ui-"));
    const application = await electron.launch({
      args: [path.resolve("."), `--user-data-dir=${userData}`],
    });
    try {
      const page = await application.firstWindow();
      const profile = ConnectionProfileSchema.parse({
        id: crypto.randomUUID(),
        name: "Stalled fixture",
        host: "127.0.0.1",
        port: address.port,
        user: "fixture",
        database: "fixture",
        tls: { kind: "disable", acknowledged: true },
        environmentColor: "#123456",
      });
      const saved = await page.evaluate(
        async (profile) =>
          Reflect.apply(window.dbapp.request, window.dbapp, [
            { kind: "connections.save", requestId: "pending", profile },
          ]),
        profile,
      );
      expect(saved.ok).toBe(true);
      await page.reload();
      await page.getByRole("button", { name: "Connect Stalled fixture", exact: true }).click();
      await expect(page.locator(".connection-state")).toHaveText("connecting");
      await page.getByRole("button", { name: "Select Stalled fixture", exact: true }).click();
      await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
      await expect.poll(() => sockets.size).toBe(1);
      const start = Date.now();
      if (action === "Reload") {
        await page.reload();
        await expect(page.locator(".connection-state")).toHaveText("No connection");
      } else {
        await page.getByRole("button", { name: "Disconnect", exact: true }).click();
        await expect(page.locator(".connection-state")).toHaveText("disconnected");
      }
      expect(Date.now() - start).toBeLessThan(2000);
      await expect.poll(() => sockets.size).toBe(0);
    } finally {
      await application.close();
      rmSync(userData, { recursive: true, force: true });
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

test("renderer reload closes a connected database backend and does not reconnect", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "dbapp-reload-ui-"));
  const observer = new Client({
    host: "localhost",
    port: 55414,
    database: "fixture",
    user: "fixture",
    password: "fixture-only-password",
    application_name: "dbapp-review-observer",
  });
  await observer.connect();
  const application = await electron.launch({
    args: [path.resolve("."), `--user-data-dir=${userData}`],
  });
  const backendCount = async () =>
    (
      await observer.query(
        "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'dbapp'",
      )
    ).rows[0]?.count;
  try {
    const page = await application.firstWindow();
    const profile = ConnectionProfileSchema.parse({
      id: crypto.randomUUID(),
      name: "Reload fixture",
      host: "localhost",
      port: 55414,
      user: "fixture",
      database: "fixture",
      tls: { kind: "verify-full", caPath: path.join(fixture.directory, "ca.crt") },
      environmentColor: "#123456",
    });
    await page.evaluate(async (profile) => {
      await Reflect.apply(window.dbapp.request, window.dbapp, [
        { kind: "connections.save", requestId: "reload-save", profile },
      ]);
      await Reflect.apply(window.dbapp.request, window.dbapp, [
        {
          kind: "connections.submitSecret",
          requestId: "reload-secret",
          id: profile.id,
          secret: "fixture-only-password",
          persist: false,
        },
      ]);
    }, profile);
    await page.reload();
    await page.getByRole("button", { name: "Connect Reload fixture", exact: true }).click();
    await expect(page.locator(".connection-state")).toHaveText("connected");
    await expect.poll(backendCount).toBe(1);
    await page.reload();
    await expect(page.locator(".connection-state")).toHaveText("No connection");
    await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
    await expect.poll(backendCount).toBe(0);
    expect(
      await application.evaluate(
        ({ app }) => app.getAppMetrics().filter((item) => item.name === "Database session").length,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "Connect Reload fixture", exact: true }).click();
    await expect(page.locator(".connection-state")).toHaveText("connected");
    await expect.poll(backendCount).toBe(1);
  } finally {
    await application.close();
    await observer.end();
    rmSync(userData, { recursive: true, force: true });
  }
});

test("Save & connect opens a real session and locks its profile", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "rowberry-manager-session-"));
  const application = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${userData}`,
    ],
  });
  try {
    const page = await application.firstWindow();
    await page.getByRole("button", { name: "New connection", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Manager fixture");
    await page.getByLabel("Port", { exact: true }).fill("55418");
    await page.getByLabel("Database", { exact: true }).fill("fixture");
    await page.getByLabel("User", { exact: true }).fill("fixture");
    await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
    if (await page.getByLabel("Save password in OS credential store").isEnabled())
      await page.getByLabel("Save password in OS credential store").uncheck();
    await page.getByText("SSL settings", { exact: false }).click();
    await page
      .getByLabel("CA certificate", { exact: true })
      .fill(path.join(fixture.directory, "ca.crt"));
    await page.getByRole("button", { name: "Save & connect", exact: true }).click();
    await expect(page.locator(".connection-state")).toHaveText("connected");
    await expect(page.getByText("Database connected", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select Manager fixture", exact: true }),
    ).toHaveAccessibleDescription("localhost:55418 / fixture Connected");
    await page.getByRole("button", { name: "Select Manager fixture", exact: true }).click();
    await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Delete Manager fixture", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.getByLabel("Name", { exact: true })).toBeEnabled();
  } finally {
    await application.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
