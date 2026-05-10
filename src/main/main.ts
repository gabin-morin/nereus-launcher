import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'path'
import { launchMinecraft } from './launcher'
import { downloadJava, downloadVersion } from './downloader'
import type { LaunchOptions, LaunchResult, ProgressEvent } from '../../types'
import { is } from '@electron-toolkit/utils'
import { loginMicrosoft, MicrosoftProfile, refreshMicrosoft } from './auth'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'

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
            await downloadJava((progress) => event.sender.send('progress', progress))
            await downloadVersion(
                opts.version,
                (progress: ProgressEvent) => event.sender.send('progress', progress),
                opts.modloader ? { type: opts.modloader, version: opts.modloaderVersion } : undefined,
                opts.id
            )
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
        let handled = false

        const handleUrl = (url: string) => {
            if (handled) return
            if (url.startsWith('https://login.live.com/oauth20_desktop.srf')) {
                handled = true  // ← bloque closed immédiatement
                const code = new URL(url).searchParams.get('code')
                authWindow.close()
                if (code) {
                    loginMicrosoft(code).then(profile => {
                        saveAuth(profile)
                        resolve(profile)
                    }).catch(reject)
                } else {
                    reject(new Error('Pas de code'))
                }
            }
        }

        authWindow.webContents.on('will-redirect', (_event, url) => handleUrl(url))
        authWindow.on('closed', () => { if (!handled) reject(new Error('Fenêtre fermée')) })
    })
})

const authPath = path.join(app.getPath('userData'), 'auth.json')

export function saveAuth(profile: MicrosoftProfile) {
    writeFileSync(authPath, JSON.stringify({ refreshToken: profile.refreshToken }))
}

export function loadAuth(): { refreshToken: string } | null {
    try {
        return JSON.parse(readFileSync(authPath, 'utf8'))
    } catch {
        return null
    }
}

ipcMain.handle('auto-login', async () => {
    const auth = loadAuth()
    if (!auth) return null
    try {
        const profile = await refreshMicrosoft(auth.refreshToken)
        saveAuth(profile) // met à jour le refresh token
        return profile
    } catch {
        return null;
    }
})

ipcMain.handle('logout', () => {
    if (existsSync(authPath)) unlinkSync(authPath)
    if (existsSync(offlineAuthPath)) unlinkSync(offlineAuthPath)
})

const offlineAuthPath = path.join(app.getPath('userData'), 'offline-auth.json')

export function saveOfflineAuth(username: string) {
  writeFileSync(offlineAuthPath, JSON.stringify({ username }))
}

export function loadOfflineAuth(): { username: string } | null {
  try {
    return JSON.parse(readFileSync(offlineAuthPath, 'utf8'))
  } catch {
    return null
  }
}

ipcMain.handle('save-offline-auth', (_event, username: string) => saveOfflineAuth(username))
ipcMain.handle('load-offline-auth', () => loadOfflineAuth())