const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
   // --- Actions ---
   setSavePath: () => ipcRenderer.invoke('set-save-path'),
   startClipboardMonitor: () => ipcRenderer.invoke('start-clipboard-monitor'),
   stopClipboardMonitor: () => ipcRenderer.invoke('stop-clipboard-monitor'),
   openFile: (path) => ipcRenderer.invoke('open-file', path),
   openFolder: (path) => ipcRenderer.invoke('open-folder', path),

   // --- Listeners ---
   // Monitor status changed (true=active, false=inactive)
   onMonitorStateChanged: (callback) => {
      const listener = (_, isActive) => callback(isActive);
      ipcRenderer.on('monitor-state-changed', listener);
      return () => ipcRenderer.removeListener('monitor-state-changed', listener);
   },
   // New image added from clipboard
   onClipboardImageAdded: (callback) => {
      const listener = (_, result) => callback(result);
      ipcRenderer.on('clipboard-image-added', listener);
      return () => ipcRenderer.removeListener('clipboard-image-added', listener);
   },
   // Final PDF save completion (success or failure)
   onMonitorComplete: (callback) => {
      const listener = (_, result) => callback(result);
      ipcRenderer.on('monitor-complete', listener);
      return () => ipcRenderer.removeListener('monitor-complete', listener);
   },
   // General errors during monitoring/saving
   onMonitorError: (callback) => {
      const listener = (_, errorMessage) => callback(errorMessage);
      ipcRenderer.on('monitor-error', listener);
      return () => ipcRenderer.removeListener('monitor-error', listener);
   },
   // 触发全局快捷键的监听器
   onTriggerStartMonitor: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('trigger-start-monitor', listener);
      return () => ipcRenderer.removeListener('trigger-start-monitor', listener);
   },
   onTriggerStopMonitor: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('trigger-stop-monitor', listener);
      return () => ipcRenderer.removeListener('trigger-stop-monitor', listener);
   },
   // 获取平台信息
   getPlatform: () => process.platform
}); 