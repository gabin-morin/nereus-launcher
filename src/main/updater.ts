import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = true      // ✅ télécharge automatiquement
autoUpdater.autoInstallOnAppQuit = true // ✅ installe à la fermeture

export function initAutoUpdater(win: BrowserWindow) {
    autoUpdater.checkForUpdates()

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
    })
}