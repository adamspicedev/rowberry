// Test-only attacker: bypass the production preload's command validation.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("attack", (input) => ipcRenderer.invoke("dbapp:request", input));
