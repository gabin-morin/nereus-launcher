import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { getOfflineProfile } from './auth'
import { MC_DIR } from './downloader'
import type { LaunchOptions, VersionJson } from '../../types'

export async function launchMinecraft(opts: LaunchOptions): Promise<void> {
  const { username, version, ram, profile } = opts
  const currentProfile = profile ?? getOfflineProfile(username)

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
    ...(process.platform === 'darwin' ? ['-XstartOnFirstThread'] : []),
    `-Xmx${ram}M`,
    `-Xms512M`,
    `-Djava.library.path=${nativesDir}`,
    '-cp', classpath,
    versionJson.mainClass,
    '--username', currentProfile.username,
    '--uuid', currentProfile.uuid,
    '--accessToken', currentProfile.accessToken,
    '--userType', currentProfile.userType,
    '--version', version,
    '--gameDir', gameDir,
    '--assetsDir', path.join(MC_DIR, 'assets'),
    '--assetIndex', versionJson.assetIndex.id,
    "--server", "play.stelycube.fr",
    "--port", "25565",
    // ...(serveur ? ['--server', serveur.ip, '--port', serveur.port.toString()] : []),
  ]

  generateServersDat(gameDir, { name: "StelyCube", ip: "play.stelycube.fr" })

  const java = spawn('java', args, { detached: true, stdio: 'pipe' })

  java.stdout?.on('data', (d: Buffer) => console.log('[MC]', d.toString().trim()))
  java.stderr?.on('data', (d: Buffer) => console.error('[MC]', d.toString().trim()))
  java.on('close', (code: number | null) => console.log(`[MC] exited (code ${code})`))
}

function generateServersDat(gameDir: string, server: { name: string, ip: string }): void {
  function writeString(str: string): Buffer {
    const strBuf = Buffer.from(str, 'utf8')
    const len = Buffer.alloc(2)
    len.writeUInt16BE(strBuf.length)
    return Buffer.concat([len, strBuf])
  }

  function writeEntry(name: string, ip: string): Buffer {
    const parts: Buffer[] = []
    // hidden: byte tag (1) named "hidden" = 0
    parts.push(Buffer.from([0x01])) // TAG_Byte
    parts.push(writeString('hidden'))
    parts.push(Buffer.from([0x00]))
    // ip
    parts.push(Buffer.from([0x08])) // TAG_String
    parts.push(writeString('ip'))
    parts.push(writeString(ip))
    // name
    parts.push(Buffer.from([0x08])) // TAG_String
    parts.push(writeString('name'))
    parts.push(writeString(name))
    // end tag
    parts.push(Buffer.from([0x00]))
    return Buffer.concat(parts)
  }

  const entry = writeEntry(server.name, server.ip)

  // TAG_Compound root ""
  // TAG_List "servers" of TAG_Compound, count=1
  const parts: Buffer[] = []
  parts.push(Buffer.from([0x0a])) // TAG_Compound root
  parts.push(writeString(''))     // root name ""
  parts.push(Buffer.from([0x09])) // TAG_List
  parts.push(writeString('servers'))
  parts.push(Buffer.from([0x0a])) // list type: TAG_Compound
  const count = Buffer.alloc(4)
  count.writeInt32BE(1)
  parts.push(count)
  parts.push(entry)
  parts.push(Buffer.from([0x00])) // end root compound

  fs.writeFileSync(path.join(gameDir, 'servers.dat'), Buffer.concat(parts))
}