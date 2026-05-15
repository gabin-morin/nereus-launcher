import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

export function initAutoUpdater(win: BrowserWindow) {

    autoUpdater.checkForUpdates().catch(err => {
        log.warn('[Updater] checkForUpdates failed:', err.message)
    })

    // Optionnel : notifier l'UI qu'une mise à jour est en cours
    autoUpdater.on('update-available', (info) => {
        win.webContents.send('update:available', info)
    })

    autoUpdater.on('download-progress', (progress) => {
        win.webContents.send('update:progress', progress)
    })

    // Quand c'est prêt → redémarre immédiatement
    autoUpdater.on('update-downloaded', () => {
        autoUpdater.quitAndInstall(true, true)
        // true, true = silent + forceRunAfter
    })

    autoUpdater.on('error', (err) => {
        log.error('[Updater]', err)
        // Ne pas envoyer l'erreur "No published versions" à l'UI
        if (!err.message.includes('No published versions')) {
            win.webContents.send('update:error', err.message)
        }
    })
}