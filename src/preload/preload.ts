import { contextBridge, ipcRenderer } from 'electron'
import type { LaunchOptions, LaunchResult, ProgressEvent } from '../../types'
import { MicrosoftProfile } from '../main/auth'

contextBridge.exposeInMainWorld('launcher', {
  launch: (opts: LaunchOptions): Promise<LaunchResult> =>
    ipcRenderer.invoke('launch', opts),

  onProgress: (cb: (e: ProgressEvent) => void): void => {
    ipcRenderer.on('progress', (_event, data: ProgressEvent) => cb(data))
  },

  minimize: (): void => { ipcRenderer.send('window-minimize') },
  toggleFullscreen: (): void => { ipcRenderer.send('window-toggle-fullscreen') },
  close: (): void => { ipcRenderer.send('window-close') },

  loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
  autoLogin: (): Promise<MicrosoftProfile | null> => ipcRenderer.invoke('auto-login'),
  logout: () => ipcRenderer.invoke('logout'),

  saveOfflineAuth: (username: string) => ipcRenderer.invoke('save-offline-auth', username),
  loadOfflineAuth: () => ipcRenderer.invoke('load-offline-auth'),

  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),

  onUpdateAvailable: (cb: (info: any) => void) =>
    ipcRenderer.on('update:available', (_e, info) => cb(info)),

  onUpdateProgress: (cb: (progress: any) => void) =>
    ipcRenderer.on('update:progress', (_e, progress) => cb(progress)),

  onUpdateDownloaded: (cb: (info: any) => void) =>
    ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),

  onUpdateError: (cb: (message: string) => void) =>
    ipcRenderer.on('update:error', (_e, message) => cb(message)),
})