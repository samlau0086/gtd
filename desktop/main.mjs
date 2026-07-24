import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  Tray,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { countDueToday, createBadgePng } from "./badge.mjs";

const APP_ID = "com.gtdflow.desktop";
const directory = dirname(fileURLToPath(import.meta.url));
const iconPath = app.isPackaged
  ? join(process.resourcesPath, "icon-512.png")
  : join(directory, "..", "public", "icon-512.png");
const setupPath = join(directory, "setup.html");
const backgroundStart = process.argv.includes("--background");

let mainWindow;
let tray;
let serverUrl;
let desktopConfig = {};
let badgeTasks = [];
let badgeCount = -1;
let dayChangeTimer;
let reloadTimer;
let isQuitting = false;

function normalizeServerUrl(value) {
  const url = new URL(String(value).trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("服务地址必须使用 http 或 https");
  }
  if (url.username || url.password) throw new Error("服务地址不能包含账号或密码");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function configPath() {
  return join(app.getPath("userData"), "desktop-config.json");
}

function readDesktopConfig() {
  try {
    const config = JSON.parse(readFileSync(configPath(), "utf8"));
    return config && typeof config === "object" ? config : {};
  } catch {
    return {};
  }
}

function persistDesktopConfig(patch) {
  desktopConfig = { ...desktopConfig, ...patch };
  writeFileSync(configPath(), `${JSON.stringify(desktopConfig, null, 2)}\n`, "utf8");
}

function readServerUrl() {
  const value = process.env.GTD_FLOW_DESKTOP_URL || desktopConfig.serverUrl;
  return value ? normalizeServerUrl(value) : undefined;
}

function saveServerUrl(value) {
  const normalized = normalizeServerUrl(value);
  persistDesktopConfig({ serverUrl: normalized });
  return normalized;
}

function validTaskSnapshot(value) {
  if (!Array.isArray(value) || value.length > 10000) return [];
  return value.flatMap((task) => {
    if (!task || typeof task !== "object") return [];
    const dueDate = typeof task.dueDate === "string" ? task.dueDate : undefined;
    const status = typeof task.status === "string" ? task.status : "";
    return [{ dueDate, status }];
  });
}

function senderMatchesServer(event) {
  if (!serverUrl) return false;
  try {
    return new URL(event.senderFrame.url).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
}

function setAutoStart(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: enabled ? ["--background"] : [],
  });
}

function autoStartEnabled() {
  return app.isPackaged && app.getLoginItemSettings().openAtLogin;
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setToolTip(
    badgeCount > 0 ? `GTD Flow · 今天到期 ${badgeCount} 项` : "GTD Flow · 今天没有到期任务",
  );
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: badgeCount > 0 ? `今天到期：${badgeCount} 项` : "今天没有到期任务", enabled: false },
    { type: "separator" },
    { label: "打开 GTD Flow", click: showWindow },
    {
      label: "重新加载",
      click: () => {
        if (serverUrl) void mainWindow?.loadURL(serverUrl);
      },
    },
    {
      label: "开机自动启动",
      type: "checkbox",
      checked: autoStartEnabled(),
      click: (item) => {
        setAutoStart(item.checked);
        persistDesktopConfig({ autoStartConfigured: true });
      },
    },
    {
      label: "更换服务器",
      click: () => {
        void mainWindow?.loadFile(setupPath).then(showWindow);
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function updateBadge() {
  const nextCount = countDueToday(badgeTasks);
  if (nextCount === badgeCount) return;
  badgeCount = nextCount;

  if (process.platform === "win32" && mainWindow) {
    const overlay = nextCount > 0
      ? nativeImage.createFromBuffer(createBadgePng(nextCount)).resize({ width: 16, height: 16 })
      : null;
    mainWindow.setOverlayIcon(
      overlay,
      nextCount > 0 ? `今天有 ${nextCount} 项任务到期` : "今天没有到期任务",
    );
  } else {
    app.setBadgeCount(nextCount);
  }
  rebuildTrayMenu();
}

function scheduleDayChange() {
  if (dayChangeTimer) clearTimeout(dayChangeTimer);
  const now = new Date();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  dayChangeTimer = setTimeout(() => {
    badgeCount = -1;
    updateBadge();
    scheduleDayChange();
  }, nextDay.getTime() - now.getTime() + 1000);
}

function loadConfiguredPage() {
  if (!mainWindow) return;
  if (serverUrl) void mainWindow.loadURL(serverUrl);
  else void mainWindow.loadFile(setupPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: "#111516",
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setAppDetails({
    appId: APP_ID,
    appIconPath: iconPath,
    relaunchCommand: `"${process.execPath}"`,
    relaunchDisplayName: "GTD Flow",
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!serverUrl) return;
    try {
      if (new URL(target).origin === new URL(serverUrl).origin) return;
    } catch {
      // 阻止无效导航。
    }
    event.preventDefault();
    if (target.startsWith("https://")) void shell.openExternal(target);
  });
  mainWindow.webContents.on("did-fail-load", (_event, _code, _description, _url, isMainFrame) => {
    if (!isMainFrame || !serverUrl) return;
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => void mainWindow?.loadURL(serverUrl), 30000);
  });
  mainWindow.once("ready-to-show", () => {
    if (!backgroundStart || !serverUrl) showWindow();
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  loadConfiguredPage();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 }));
  tray.on("click", showWindow);
  rebuildTrayMenu();
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", showWindow);
  app.on("before-quit", () => {
    isQuitting = true;
  });
  app.on("window-all-closed", () => {
    // 托盘进程需要保持运行，任务栏徽标才能在窗口关闭后继续更新。
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    desktopConfig = readDesktopConfig();
    serverUrl = readServerUrl();
    createWindow();
    createTray();
    if (app.isPackaged && desktopConfig.autoStartConfigured !== true) {
      setAutoStart(true);
      persistDesktopConfig({ autoStartConfigured: true });
    }
    scheduleDayChange();
    powerMonitor.on("resume", () => {
      badgeCount = -1;
      updateBadge();
      if (serverUrl) mainWindow?.webContents.reload();
    });
  });
}

ipcMain.on("desktop:sync-tasks", (event, tasks) => {
  if (!senderMatchesServer(event)) return;
  badgeTasks = validTaskSnapshot(tasks);
  badgeCount = -1;
  updateBadge();
});

ipcMain.handle("desktop:save-server-url", async (event, value) => {
  if (!event.senderFrame.url.startsWith("file:")) throw new Error("不允许修改服务地址");
  serverUrl = saveServerUrl(value);
  badgeTasks = [];
  badgeCount = -1;
  updateBadge();
  await mainWindow?.loadURL(serverUrl);
  showWindow();
  return serverUrl;
});
