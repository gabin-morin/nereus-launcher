import https from 'https'
import path from 'path'
import os from 'os'
import type { VersionManifest, VersionJson, ProgressEvent } from '../../types'
import { mkdirSync, existsSync, createWriteStream, writeFileSync } from 'fs'

export const MC_DIR = (() => {
  switch (process.platform) {
    case 'win32': return path.join(process.env.APPDATA!, '.nereus-launcher')
    case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support', '.nereus-launcher')
    default: return path.join(os.homedir(), '.nereus-launcher')
  }
})()

const VERSIONS_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

function httpsGet<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = ''
            res.on('data', (chunk: string) => (data += chunk))
            res.on('end', () => resolve(JSON.parse(data) as T))
        }).on('error', reject)
    })
}

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        mkdirSync(path.dirname(dest), { recursive: true })
        if (existsSync(dest)) return resolve()
        const file = createWriteStream(dest)
        https.get(url, (res) => {
            res.pipe(file)
            file.on('finish', () => file.close(() => resolve()))
        }).on('error', reject)
    })
}

export async function downloadVersion(
    versionId: string,
    onProgress: (e: ProgressEvent) => void
): Promise<{ versionJson: VersionJson; jarPath: string }> {
    onProgress({ step: 'Récupération du manifest...', percent: 0 })

    const manifest = await httpsGet<VersionManifest>(VERSIONS_URL)
    const versionInfo = manifest.versions.find((v) => v.id === versionId)
    if (!versionInfo) throw new Error(`Version ${versionId} introuvable`)

    const versionJson = await httpsGet<VersionJson>(versionInfo.url)

    onProgress({ step: 'Téléchargement du client JAR...', percent: 20 })
    const jarPath = path.join(MC_DIR, 'versions', versionId, `${versionId}.jar`)
    await downloadFile(versionJson.downloads.client.url, jarPath)

    onProgress({ step: 'Téléchargement des librairies...', percent: 40 })
    const libs = versionJson.libraries.filter((l) => l.downloads?.artifact)
    for (let i = 0; i < libs.length; i++) {
        const artifact = libs[i].downloads!.artifact!
        await downloadFile(artifact.url, path.join(MC_DIR, 'libraries', artifact.path))
        if (i % 10 === 0) {
            onProgress({
                step: `Librairies (${i}/${libs.length})...`,
                percent: 40 + Math.round((i / libs.length) * 40)
            })
        }
    }

    onProgress({ step: 'Téléchargement des assets...', percent: 80 })

    const assetIndex = await httpsGet<{ objects: Record<string, { hash: string }> }>(versionJson.assetIndex.url)
    const assetIndexPath = path.join(MC_DIR, 'assets', 'indexes', `${versionJson.assetIndex.id}.json`)
    mkdirSync(path.dirname(assetIndexPath), { recursive: true })
    writeFileSync(assetIndexPath, JSON.stringify(assetIndex, null, 2))

    const objects = Object.values(assetIndex.objects)
    for (let i = 0; i < objects.length; i++) {
        const { hash } = objects[i]
        const subdir = hash.substring(0, 2)
        const dest = path.join(MC_DIR, 'assets', 'objects', subdir, hash)
        await downloadFile(`https://resources.download.minecraft.net/${subdir}/${hash}`, dest)
        if (i % 50 === 0) {
            onProgress({
                step: `Assets (${i}/${objects.length})...`,
                percent: 80 + Math.round((i / objects.length) * 15)
            })
        }
    }

    const jsonPath = path.join(MC_DIR, 'versions', versionId, `${versionId}.json`)
    writeFileSync(jsonPath, JSON.stringify(versionJson, null, 2))

    onProgress({ step: 'Prêt !', percent: 100 })
    return { versionJson, jarPath }
}