/** Wire format between the app and the Worker's /api/sync. */
export const SYNC_KINDS = ['wines', 'bottles', 'tastings', 'locations'] as const
export type SyncKind = (typeof SYNC_KINDS)[number]

export interface SyncChange {
  kind: SyncKind
  id: string
  /** Last modified on the device (ms). The newest write wins. */
  updatedAt: number
  deleted: boolean
  /** The record as JSON (null when deleted). Photos are not included; they go to /api/photo. */
  data: Record<string, unknown> | null
}

export interface SyncRequest {
  /** Server revision the device has seen so far (0 = never synced). */
  cursor: number
  changes: SyncChange[]
}

export interface SyncResponse {
  cursor: number
  changes: SyncChange[]
  /** True when there are more changes to pull: call again with the new cursor. */
  more: boolean
  /** How many of the pushed changes the server kept (the rest were older than what it had). */
  accepted: number
}

export const MAX_PUSH = 500
export const MAX_PULL = 1000
