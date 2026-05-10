export interface LaunchOptions {
  username: string
  version: string
  ram: number
  serveur?: {
    ip: string
    port: number
  }
  profile?: OfflineProfile | null
  id: string
  modloader: string
  modloaderVersion: string
  resourcePacks?: string[]
}

export interface OfflineProfile {
  uuid: string
  username: string
  accessToken: string
  userType: string
}

export interface ProgressEvent {
  step: string
  percent: number
}

export interface LaunchResult {
  success: boolean
  error?: string
}

export interface VersionManifest {
  versions: Array<{
    id: string
    type: string
    url: string
  }>
}

export interface VersionJson {
  mainClass: string
  assetIndex: { id: string; url: string }
  downloads: {
    client: { url: string; sha1: string }
  }
  libraries: Array<{
    name: string
    downloads?: {
      artifact?: {
        url: string
        path: string
        sha1: string
      }
    }
  }>
}

declare global {
  interface Window {
    launcher: {
      launch: (opts: LaunchOptions) => Promise<LaunchResult>
      onProgress: (cb: (e: ProgressEvent) => void) => void
      minimize: () => void
      toggleFullscreen: () => void
      close: () => void
      logout: () => Promise<void>
      loginMicrosoft: () => Promise<OfflineProfile | null>
      autoLogin: () => Promise<OfflineProfile | null>
      saveOfflineAuth: (username: string) => Promise<void>
      loadOfflineAuth: () => Promise<{ username: string } | null>
    }
  }
}