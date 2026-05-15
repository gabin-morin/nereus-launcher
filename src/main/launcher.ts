import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { getOfflineProfile } from './auth'
import { findJavaExec, MC_DIR } from './downloader'
import type { LaunchOptions, VersionJson } from '../../types'

export async function launchMinecraft(opts: LaunchOptions): Promise<void> {
  const { username, version, ram, profile, id, serveur } = opts
  const currentProfile = profile ?? getOfflineProfile(username)

  const versionJsonPath = path.join(MC_DIR, 'versions', version, `${version}.json`)
  const versionJson: VersionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'))

  // Classpath : toutes les libs + JAR client
  const libPaths = versionJson.libraries
    .filter((l) => l.downloads?.artifact)
    .map((l) => path.join(MC_DIR, 'libraries', l.downloads!.artifact!.path))

  let mainClass = versionJson.mainClass

  if (opts.modloader === 'fabric') {
    const fabricJsonPath = path.join(MC_DIR, 'versions', `fabric-${version}-${opts.modloaderVersion}`, 'fabric.json')
    const fabricProfile = JSON.parse(fs.readFileSync(fabricJsonPath, 'utf8'))
    mainClass = fabricProfile.mainClass

    const fabricLibs = fabricProfile.libraries
      .map((l: { name: string }) => {
        const [group, artifact, ver] = l.name.split(':')
        const groupPath = group.replace(/\./g, '/')
        return path.join(MC_DIR, 'libraries', `${groupPath}/${artifact}/${ver}/${artifact}-${ver}.jar`)
      })

    libPaths.unshift(...fabricLibs)
  }

  const jarPath = path.join(MC_DIR, 'versions', version, `${version}.jar`)
  const sep = os.platform() === 'win32' ? ';' : ':'
  const classpath = [...libPaths, jarPath].join(sep)

  const gameDir = path.join(MC_DIR, 'instances', id, 'game')
  const nativesDir = path.join(MC_DIR, 'versions', version, 'natives')
  fs.mkdirSync(gameDir, { recursive: true })
  fs.mkdirSync(nativesDir, { recursive: true })


  const args: string[] = [
    ...(process.platform === 'darwin' ? ['-XstartOnFirstThread'] : []),
    `-Xmx${ram}G`,
    `-Xms512M`,
    `-Djava.library.path=${nativesDir}`,
    '-cp', classpath,
    mainClass,
    '--username', currentProfile.username,
    '--uuid', currentProfile.uuid,
    '--accessToken', currentProfile.accessToken,
    '--userType', currentProfile.userType,
    '--version', version,
    '--gameDir', gameDir,
    '--assetsDir', path.join(MC_DIR, 'assets'),
    '--assetIndex', versionJson.assetIndex.id,
    ...(serveur ? ['--server', serveur.ip, '--port', serveur.port.toString()] : []),
  ]

  generateServersDat(gameDir, { name: "Minecraft server", ip: serveur?.ip ?? "" })

  const javaDir = path.join(MC_DIR, 'java', '25')
  const javaExec = findJavaExec(javaDir)

  console.log('[launcher] java path:', javaExec)
  console.log('[launcher] java exists:', fs.existsSync(javaExec))



  // Ressources packs
  const resourcepacksDir = path.join(gameDir, 'resourcepacks')
  fs.mkdirSync(resourcepacksDir, { recursive: true })

  const packs = fs.existsSync(resourcepacksDir)
    ? fs.readdirSync(resourcepacksDir)
      .filter(f => !f.startsWith('.') && (f.endsWith('.zip') || f.endsWith('.jar')))
      .map(f => `"file/${f}"`)
    : []

  const modsDir = path.join(gameDir, 'mods')
  const mods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : []

  const builtinPacks: string[] = []
  if (mods.some(m => m.includes('continuity'))) builtinPacks.push('"continuity:default"', '"continuity:connected_glass"', '"continuity:glass_pane_culling_fix"')
  if (mods.some(m => m.includes('sodium'))) builtinPacks.push('"sodium:default"')

  const allPacks = [...builtinPacks, ...packs]

  const optionsPath = path.join(gameDir, 'options.txt')
  let options = fs.existsSync(optionsPath) ? fs.readFileSync(optionsPath, 'utf8') : ''

  const existingMatch = options.match(/resourcePacks:\[([^\]]*)\]/)
  const existingPacks: string[] = existingMatch
    ? existingMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    : []

  const mergedPacks = [...new Set([...existingPacks, ...allPacks])]
  const packsStr = `resourcePacks:[${mergedPacks.join(',')}]`

  if (options.includes('resourcePacks:')) {
    options = options.replace(/resourcePacks:\[([^\]]*)\]/, packsStr)
  } else {
    options += `\n${packsStr}`
  }

  fs.writeFileSync(optionsPath, options)

  const java = spawn(javaExec, args, { detached: true, stdio: 'pipe' })

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