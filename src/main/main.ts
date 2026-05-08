import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'path'
import { launchMinecraft } from './launcher'
import { downloadVersion } from './downloader'
import type { LaunchOptions, LaunchResult, ProgressEvent } from '../../types'
import { is } from '@electron-toolkit/utils'

function createWindow(): void {
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        frame: false,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        win.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

ipcMain.handle(
    'launch',
    async (event: IpcMainInvokeEvent, opts: LaunchOptions): Promise<LaunchResult> => {
        try {
            await downloadVersion(opts.version, (progress: ProgressEvent) => {
                event.sender.send('progress', progress)
            })
            await launchMinecraft(opts)
            return { success: true }
        } catch (err) {
            return { success: false, error: (err as Error).message }
        }
    }
)

ipcMain.on('window-minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window-toggle-fullscreen', () => BrowserWindow.getFocusedWindow()?.setFullScreen(!BrowserWindow.getFocusedWindow()?.isFullScreen()))
ipcMain.on('window-close', () => app.quit())