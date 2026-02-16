const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pia', {
  // App info
  getVersion: () => ipcRenderer.invoke('pia:get-version'),
  getHostname: () => ipcRenderer.invoke('pia:get-hostname'),

  // First-run / Settings
  isFirstRun: () => ipcRenderer.invoke('pia:is-first-run'),
  getSettings: () => ipcRenderer.invoke('pia:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('pia:save-settings', settings),
  saveConfig: (config) => ipcRenderer.invoke('pia:save-config', config),

  // Server control
  restartServer: () => ipcRenderer.invoke('pia:restart-server'),
  getServerStatus: () => ipcRenderer.invoke('pia:server-status'),

  // Secure storage for API keys
  saveApiKey: (name, key) => ipcRenderer.invoke('pia:save-api-key', name, key),
  getApiKey: (name) => ipcRenderer.invoke('pia:get-api-key', name),
  deleteApiKey: (name) => ipcRenderer.invoke('pia:delete-api-key', name),

  // Tailscale peer discovery
  discoverPeers: () => ipcRenderer.invoke('pia:discover-peers'),

  // Config export/import
  exportConfig: () => ipcRenderer.invoke('pia:export-config'),
  importConfig: (config) => ipcRenderer.invoke('pia:import-config', config),
});
