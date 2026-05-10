import { v5 as uuidv5 } from 'uuid'
import type { OfflineProfile } from '../../types'

interface MSTokenResponse { access_token: string; refresh_token: string }
interface XBLResponse { Token: string; DisplayClaims: { xui: Array<{ uhs: string }> } }
interface XSTSResponse { Token: string }
interface MCTokenResponse { access_token: string }
interface MCProfileResponse { id: string; name: string }

const OFFLINE_NS = '00000000-0000-0000-0000-000000000000'

export function getOfflineProfile(username: string): OfflineProfile {
  return {
    uuid: uuidv5(username, OFFLINE_NS),
    username,
    accessToken: 'offline',
    userType: 'legacy'
  }
}

export interface MicrosoftProfile {
  uuid: string
  username: string
  accessToken: string
  refreshToken?: string
  userType: 'msa' | 'legacy'
}

async function msTokenToProfile(msAccessToken: string, msRefreshToken: string): Promise<MicrosoftProfile> {
  const xbl = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: msAccessToken },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  }).then(r => r.json()) as XBLResponse

  const xsts = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  }).then(r => r.json()) as XSTSResponse

  const mc = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${xbl.DisplayClaims.xui[0].uhs};${xsts.Token}` })
  }).then(r => r.json()) as MCTokenResponse

  const profile = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}` }
  }).then(r => r.json()) as MCProfileResponse

  return {
    uuid: profile.id,
    username: profile.name,
    accessToken: mc.access_token,
    refreshToken: msRefreshToken,
    userType: 'msa'
  }
}

export async function loginMicrosoft(authCode: string): Promise<MicrosoftProfile> {
    // 1. Token Microsoft
    const msToken = await fetch(
        `https://login.live.com/oauth20_token.srf?client_id=00000000402b5328&code=${authCode}&redirect_uri=https://login.live.com/oauth20_desktop.srf&grant_type=authorization_code&scope=service::user.auth.xboxlive.com::MBI_SSL`
    ).then(r => r.json()) as { access_token: string }

    // 2. Xbox Live
    const xbl = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: msToken.access_token },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        })
    }).then(r => r.json()) as { Token: string, DisplayClaims: { xui: Array<{ uhs: string }> } }

    // 3. XSTS
    const xsts = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT'
        })
    }).then(r => r.json()) as { Token: string }

    // 4. Minecraft
    const mc = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken: `XBL3.0 x=${xbl.DisplayClaims.xui[0].uhs};${xsts.Token}` })
    }).then(r => r.json()) as { access_token: string }

    // 5. Profil
    const profile = await fetch('https://api.minecraftservices.com/minecraft/profile', {
        headers: { Authorization: `Bearer ${mc.access_token}` }
    }).then(r => r.json()) as { id: string, name: string }

    return {
        uuid: profile.id,
        username: profile.name,
        accessToken: mc.access_token,
        userType: 'msa'
    }
}