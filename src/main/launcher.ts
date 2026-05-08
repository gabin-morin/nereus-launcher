import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { getOfflineProfile } from './auth'
import { MC_DIR } from './downloader'
import type { LaunchOptions, VersionJson } from '../../types'

export async function launchMinecraft(opts: LaunchOptions): Promise<void> {
  const { username, version, ram } = opts
  const profile = getOfflineProfile(username)

  const versionJsonPath = path.join(MC_DIR, 'versions', version, `${version}.json`)
  const versionJson: VersionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'))

  // Classpath : toutes les libs + JAR client
  const libPaths = versionJson.libraries
    .filter((l) => l.downloads?.artifact)
    .map((l) => path.join(MC_DIR, 'libraries', l.downloads!.artifact!.path))

  const jarPath = path.join(MC_DIR, 'versions', version, `${version}.jar`)
  const sep = os.platform() === 'win32' ? ';' : ':'
  const classpath = [...libPaths, jarPath].join(sep)

  const gameDir = path.join(MC_DIR, 'game')
  const nativesDir = path.join(MC_DIR, 'versions', version, 'natives')
  fs.mkdirSync(gameDir, { recursive: true })
  fs.mkdirSync(nativesDir, { recursive: true })

  const args: string[] = [
    `-Xmx${ram}M`,
    `-Xms512M`,
    `-Djava.library.path=${nativesDir}`,
    '-cp', classpath,
    versionJson.mainClass,
    '--username', profile.username,
    '--uuid', profile.uuid,
    '--accessToken', profile.accessToken,
    '--userType', profile.userType,
    '--version', version,
    '--gameDir', gameDir,
    '--assetsDir', path.join(MC_DIR, 'assets'),
    '--assetIndex', versionJson.assetIndex.id,
    // Pour auto-connecter à ton serveur, décommente :
    // '--server', 'ton-ip',
    // '--port', '25565',
  ]

  const java = spawn('java', args, { detached: true, stdio: 'pipe' })

  java.stdout?.on('data', (d: Buffer) => console.log('[MC]', d.toString().trim()))
  java.stderr?.on('data', (d: Buffer) => console.error('[MC]', d.toString().trim()))
  java.on('close', (code: number | null) => console.log(`[MC] exited (code ${code})`))
}