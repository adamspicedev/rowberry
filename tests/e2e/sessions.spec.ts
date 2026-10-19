import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { createServer, type Socket } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";
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

test("Disconnect remains available while a main-bridge connection handshake is pending", async () => {
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
    await expect.poll(() => sockets.size).toBe(1);
    const start = Date.now();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.locator(".connection-state")).toHaveText("disconnected");
    expect(Date.now() - start).toBeLessThan(2000);
    await expect.poll(() => sockets.size).toBe(0);
  } finally {
    await application.close();
    rmSync(userData, { recursive: true, force: true });
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
