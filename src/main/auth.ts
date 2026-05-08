import { v5 as uuidv5 } from 'uuid'
import type { OfflineProfile } from '../../types'

const OFFLINE_NS = '00000000-0000-0000-0000-000000000000'

export function getOfflineProfile(username: string): OfflineProfile {
  return {
    uuid: uuidv5(username, OFFLINE_NS),
    username,
    accessToken: 'offline',
    userType: 'legacy'
  }
}