import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'path'
import { launchMinecraft } from './launcher'
import { downloadVersion } from './downloader'
import type { LaunchOptions, LaunchResult, ProgressEvent } from '../../types'
import { is } from '@electron-toolkit/utils'
import { loginMicrosoft } from './auth'

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

ipcMain.handle('login-microsoft', async () => {
    const CLIENT_ID = '00000000402b5328'
    const authUrl = `https://login.live.com/oauth20_authorize.srf?prompt=select_account&client_id=${CLIENT_ID}&response_type=code&scope=service%3A%3Auser.auth.xboxlive.com%3A%3AMBI_SSL&redirect_uri=https%3A%2F%2Flogin.live.com%2Foauth20_desktop.srf&lw=1&fl=dob,easi2&xsup=1&nopa=2`

    const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        webPreferences: { nodeIntegration: false }
    })

    authWindow.loadURL(authUrl)

    // Intercepte le redirect pour récupérer le code
    return new Promise((resolve, reject) => {
        const handleUrl = (url: string) => {
            if (url.startsWith('https://login.live.com/oauth20_desktop.srf')) {
                const code = new URL(url).searchParams.get('code')
                authWindow.close()
                if (code) resolve(loginMicrosoft(code))
                else reject(new Error('Pas de code'))
            }
        }

        authWindow.webContents.on('will-redirect', (_event, url) => handleUrl(url))
        authWindow.webContents.on('did-navigate', (_event, url) => handleUrl(url))
        authWindow.on('closed', () => reject(new Error('Fenêtre fermée')))
    })
})
