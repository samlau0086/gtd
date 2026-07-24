import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { countDueToday, createBadgePng, localDate } from "../desktop/badge.mjs";

test("desktop badge counts only unfinished tasks due today", () => {
  const tasks = [
    { status: "next", dueDate: "2026-07-24" },
    { status: "waiting", dueDate: "2026-07-24" },
    { status: "done", dueDate: "2026-07-24" },
    { status: "next", dueDate: "2026-07-23" },
    { status: "next", startDate: "2026-07-24" },
  ];
  assert.equal(countDueToday(tasks, "2026-07-24"), 2);
});

test("desktop badge uses the computer local calendar date", () => {
  assert.equal(localDate(new Date(2026, 6, 24, 0, 1)), "2026-07-24");
});

test("desktop badge renderer produces a valid PNG for one and two digits", () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(createBadgePng(7).subarray(0, 8), signature);
  assert.deepEqual(createBadgePng(42).subarray(0, 8), signature);
  assert.deepEqual(createBadgePng(120).subarray(0, 8), signature);
});

test("desktop client stays resident and exposes only the narrow task bridge", async () => {
  const [main, preload, desktopPackage] = await Promise.all([
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/package.json", import.meta.url), "utf8"),
  ]);
  assert.match(main, /function closeToTray\(\)/);
  assert.match(main, /mainWindow\.hide\(\)/);
  assert.match(main, /mainWindow\.setSkipTaskbar\(true\)/);
  assert.match(main, /mainWindow\.setSkipTaskbar\(false\)/);
  assert.doesNotMatch(main, /mainWindow\.minimize\(\)/);
  assert.match(main, /setOverlayIcon/);
  assert.match(main, /function trayIconForCount\(count\)/);
  assert.match(main, /tray\.setImage\(trayIconForCount\(badgeCount\)\)/);
  assert.match(main, /new Tray\(trayIconForCount\(badgeCount\)\)/);
  assert.match(main, /setLoginItemSettings/);
  assert.match(main, /scheduleDayChange/);
  assert.match(main, /powerMonitor\.on\("resume"/);
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("gtdDesktop"/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^]*ipcRenderer\s*[,}]/);
  assert.match(desktopPackage, /"electronDist": "\.\.\/node_modules\/electron\/dist"/);
});
