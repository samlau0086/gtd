// Electron sandboxed preload scripts must use the limited CommonJS loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gtdDesktop", {
  syncTasks(tasks) {
    ipcRenderer.send("desktop:sync-tasks", tasks);
  },
  saveServerUrl(url) {
    return ipcRenderer.invoke("desktop:save-server-url", url);
  },
});
