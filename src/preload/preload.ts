import { contextBridge, ipcRenderer } from 'electron'
import type { LaunchOptions, LaunchResult, ProgressEvent } from '../../types'

contextBridge.exposeInMainWorld('launcher', {
  launch: (opts: LaunchOptions): Promise<LaunchResult> =>
    ipcRenderer.invoke('launch', opts),

  onProgress: (cb: (e: ProgressEvent) => void): void => {
    ipcRenderer.on('progress', (_event, data: ProgressEvent) => cb(data))
  },

  minimize: (): void => { ipcRenderer.send('window-minimize') },
  toggleFullscreen: (): void => { ipcRenderer.send('window-toggle-fullscreen') },
  close: (): void => { ipcRenderer.send('window-close') }
})