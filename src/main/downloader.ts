import https from 'https'
import path from 'path'
import os from 'os'
import type { VersionManifest, VersionJson, ProgressEvent } from '../../types'
import { mkdirSync, existsSync, createWriteStream, writeFileSync, unlinkSync, rmSync, readFileSync, readdirSync, statSync, copyFileSync } from 'fs'
import extractZip from 'extract-zip'

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

async function downloadConcurrent(tasks: (() => Promise<void>)[], concurrency = 32): Promise<void> {
    const queue = [...tasks]
    const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
            const task = queue.shift()
            if (task) await task()
        }
    })
    await Promise.all(workers)
}

function mavenToPath(name: string): string {
    const [group, artifact, version] = name.split(':')
    const groupPath = group.replace(/\./g, '/')
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`
}

export async function downloadVersion(
    versionId: string,
    onProgress: (e: ProgressEvent) => void,
    modloader?: { type: string; version: string },
    instanceId?: string
): Promise<{ versionJson: VersionJson; jarPath: string }> {
    onProgress({ step: 'Récupération du manifest...', percent: 0 })

    const manifest = await httpsGet<VersionManifest>(VERSIONS_URL)
    const versionInfo = manifest.versions.find((v) => v.id === versionId)
    if (!versionInfo) throw new Error(`Version ${versionId} introuvable`)

    const versionJson = await httpsGet<VersionJson>(versionInfo.url)

    onProgress({ step: 'Téléchargement du client JAR...', percent: 10 })
    const jarPath = path.join(MC_DIR, 'versions', versionId, `${versionId}.jar`)
    await downloadFile(versionJson.downloads.client.url, jarPath)

    onProgress({ step: 'Téléchargement des librairies...', percent: 20 })
    const libs = versionJson.libraries.filter((l) => l.downloads?.artifact)
    for (let i = 0; i < libs.length; i++) {
        const artifact = libs[i].downloads!.artifact!
        await downloadFile(artifact.url, path.join(MC_DIR, 'libraries', artifact.path))
        if (i % 10 === 0) {
            onProgress({
                step: `Librairies (${i}/${libs.length})...`,
                percent: 20 + Math.round((i / libs.length) * 20)
            })
        }
    }

    onProgress({ step: 'Téléchargement des assets...', percent: 40 })

    const assetIndex = await httpsGet<{ objects: Record<string, { hash: string }> }>(versionJson.assetIndex.url)
    const assetIndexPath = path.join(MC_DIR, 'assets', 'indexes', `${versionJson.assetIndex.id}.json`)
    mkdirSync(path.dirname(assetIndexPath), { recursive: true })
    writeFileSync(assetIndexPath, JSON.stringify(assetIndex, null, 2))

    const objects = Object.values(assetIndex.objects)
    let completedAssets = 0

    const assetTasks = objects.map((obj) => async () => {
        const { hash } = obj
        const subdir = hash.substring(0, 2)
        const dest = path.join(MC_DIR, 'assets', 'objects', subdir, hash)
        await downloadFile(`https://resources.download.minecraft.net/${subdir}/${hash}`, dest)
        completedAssets++
        if (completedAssets % 50 === 0) {
            onProgress({
                step: `Assets (${completedAssets}/${objects.length})...`,
                percent: 40 + Math.round((completedAssets / objects.length) * 30)
            })
        }
    })

    await downloadConcurrent(assetTasks, 32)

    const jsonPath = path.join(MC_DIR, 'versions', versionId, `${versionId}.json`)
    writeFileSync(jsonPath, JSON.stringify(versionJson, null, 2))

    if (modloader?.type === 'fabric') {
        await downloadFabric(versionId, modloader.version, onProgress)
    }

    if (instanceId) {
        await downloadInstance(instanceId, onProgress)
    }

    onProgress({ step: 'Prêt !', percent: 100 })
    return { versionJson, jarPath }
}

export async function downloadFabric(
    minecraftVersion: string,
    loaderVersion: string,
    onProgress: (e: ProgressEvent) => void
): Promise<void> {
    onProgress({ step: 'Téléchargement de Fabric...', percent: 70 })

    const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${loaderVersion}/profile/json`
    const profile = await fetch(profileUrl).then(r => r.json()) as {
        mainClass: string
        libraries: Array<{ name: string; url: string }>
    }

    const fabricJsonPath = path.join(MC_DIR, 'versions', `fabric-${minecraftVersion}-${loaderVersion}`, 'fabric.json')
    mkdirSync(path.dirname(fabricJsonPath), { recursive: true })
    writeFileSync(fabricJsonPath, JSON.stringify(profile, null, 2))

    const libs = profile.libraries
    let completed = 0

    const tasks = libs.map((lib) => async () => {
        const libPath = mavenToPath(lib.name)
        const url = (lib.url ?? 'https://repo1.maven.org/maven2/') + libPath
        await downloadFile(url, path.join(MC_DIR, 'libraries', libPath))
        completed++
        onProgress({
            step: `Fabric libs (${completed}/${libs.length})...`,
            percent: 70 + Math.round((completed / libs.length) * 15)
        })
    })

    await downloadConcurrent(tasks, 16)
}

export async function downloadInstance(
    instanceId: string,
    onProgress: (e: ProgressEvent) => void
): Promise<void> {
    const BASE_URL = `https://gabin-morin.fr/nereus/${instanceId}`
    const instanceDir = path.join(MC_DIR, 'instances', instanceId, 'game')
    const zipPath = path.join(MC_DIR, 'instances', instanceId, 'instance.zip')
    const hashPath = path.join(MC_DIR, 'instances', instanceId, 'instance.zip.sha256')

    const remoteHash = await fetch(`${BASE_URL}/instance.zip.sha256`).then(r => r.text()).then(t => t.trim())
    const localHash = existsSync(hashPath) ? readFileSync(hashPath, 'utf8').trim() : ''

    if (remoteHash === localHash) {
        onProgress({ step: 'Instance à jour !', percent: 100 })
        return
    }

    if (existsSync(zipPath)) unlinkSync(zipPath)

    const zipResponse = await fetch(`${BASE_URL}/instance.zip`, { method: 'HEAD' })
    if (!zipResponse.ok) {
        onProgress({ step: 'Aucune instance trouvée', percent: 100 })
        return
    }

    onProgress({ step: "Téléchargement de l'instance...", percent: 85 })
    await downloadFileFollowRedirects(`${BASE_URL}/instance.zip`, zipPath)

    onProgress({ step: 'Extraction...', percent: 95 })

    const tmpDir = path.join(MC_DIR, 'instances', instanceId, '_tmp')
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    await extractZip(zipPath, { dir: tmpDir })

    const UPDATABLE = new Set(['mods', 'resourcepacks', 'shaderpacks'])

    mkdirSync(instanceDir, { recursive: true })


    function copyDir(src: string, dest: string) {
        mkdirSync(dest, { recursive: true })
        for (const entry of readdirSync(src)) {
            if (!UPDATABLE.has(entry)) continue // on ne touche qu'aux dossiers connus
            const srcPath = path.join(src, entry)
            const destPath = path.join(dest, entry)
            if (statSync(srcPath).isDirectory()) {
                // Pour les mods : remplacer entièrement le dossier
                if (existsSync(destPath)) rmSync(destPath, { recursive: true, force: true })
                copyDir(srcPath, destPath)
            } else {
                copyFileSync(srcPath, destPath)
            }
        }
    }

    copyDir(tmpDir, instanceDir)
    rmSync(tmpDir, { recursive: true, force: true })

    writeFileSync(hashPath, remoteHash)
}

export function findJavaExec(javaDir: string): string {
    if (existsSync(path.join(javaDir, 'bin', 'java.exe'))) return path.join(javaDir, 'bin', 'java.exe')
    if (existsSync(path.join(javaDir, 'bin', 'java'))) return path.join(javaDir, 'bin', 'java')
    if (existsSync(path.join(javaDir, 'Contents', 'Home', 'bin', 'java'))) return path.join(javaDir, 'Contents', 'Home', 'bin', 'java')
    console.log('[Java] entries:', readdirSync(javaDir))
    // Cherche un sous-dossier genre jdk-25.0.3+9
    const entries = readdirSync(javaDir)
    for (const entry of entries) {
        const sub = path.join(javaDir, entry)
        if (statSync(sub).isDirectory()) {
            const candidates = [
                path.join(sub, 'bin', 'java.exe'),
                path.join(sub, 'bin', 'java'),
                path.join(sub, 'Contents', 'Home', 'bin', 'java')
            ]
            for (const c of candidates) {
                if (existsSync(c)) return c
            }
        }
    }
    throw new Error('Java introuvable dans ' + javaDir)
}

export async function downloadJava(onProgress: (e: ProgressEvent) => void): Promise<void> {
    const javaDir = path.join(MC_DIR, 'java', '25')

    if (existsSync(javaDir)) {
        try {
            const javaExec = findJavaExec(javaDir)
            if (existsSync(javaExec)) return // déjà installé
        } catch {
            // Java introuvable, on re-télécharge
        }
    }

    onProgress({ step: 'Téléchargement de Java 25...', percent: 0 })


    const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'

    const apiUrl = `https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=${arch}&image_type=jdk&os=${os}&vendor=eclipse`
    const assets = await fetch(apiUrl).then(r => r.json()) as Array<{ binary: { package: { link: string } } }>
    const downloadUrl = assets[0].binary.package.link

    const ext = os === 'windows' ? '.zip' : '.tar.gz'
    const archivePath = path.join(MC_DIR, 'java', `java25${ext}`)

    try {
        await downloadFileFollowRedirects(downloadUrl, archivePath)
        console.log('[Java] archive téléchargée')
    } catch (err) {
        console.error('[Java] erreur téléchargement:', err)
        throw err
    }
    onProgress({ step: 'Extraction de Java...', percent: 90 })

    mkdirSync(javaDir, { recursive: true })

    if (ext === '.zip') {
        await extractZip(archivePath, { dir: javaDir })
    } else {
        try {
            mkdirSync(javaDir, { recursive: true })
            const { execSync } = await import('child_process')
            execSync(`tar -xzf "${archivePath}" -C "${javaDir}" --strip-components=1`)
            console.log('[Java] extraction OK')
        } catch (err) {
            console.error('[Java] erreur extraction:', err)
            throw err
        }
    }

    console.log('[Java] Contenu de javaDir:')
    listDir(javaDir)

    onProgress({ step: 'Java prêt !', percent: 100 })
}

async function downloadFileFollowRedirects(url: string, dest: string): Promise<void> {
    mkdirSync(path.dirname(dest), { recursive: true })
    if (existsSync(dest)) return

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download: ${response.status}`)

    const buffer = await response.arrayBuffer()
    writeFileSync(dest, Buffer.from(buffer))
}

function listDir(dir: string, depth = 0) {
    if (depth > 3) return
    for (const f of readdirSync(dir)) {
        console.log('  '.repeat(depth) + f)
        const full = path.join(dir, f)
        if (statSync(full).isDirectory()) listDir(full, depth + 1)
    }
}