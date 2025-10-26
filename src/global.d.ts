// src/global.d.ts
import type { Settings } from './types'

type GmailSendArgs = {
  to: string
  subject: string
  text: string
  bcc?: string
}

type GmailSendOk = { ok: true; id: string; remaining: number; cap: number }
type GmailSendErr = { ok: false; error?: string }
type GmailSendResult = GmailSendOk | GmailSendErr

type Quota = { used: number; cap: number; remaining: number }

declare global {
  interface Window {
    api: {
      // settings
      getSettings(): Promise<Settings>
      updateSettings(s: Settings): Promise<{ ok: true }>

      // secrets
      setSecret(key: string, value: string): Promise<{ ok: true }>
      getSecret(key: string): Promise<string | null>

      // gmail
      gmailStatus(): Promise<{ connected: boolean; email?: string; error?: string }>
      gmailConnect(): Promise<{ ok: boolean; email?: string }>
      gmailSend(payload: GmailSendArgs): Promise<GmailSendResult>
      gmailQuota(): Promise<Quota>
    }
  }
}

export {}
