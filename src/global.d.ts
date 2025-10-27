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
      companyLike: (domain: string, v: 1|-1|0)=>Promise<{ok:boolean; error?:string}>;
      getSettings(): Promise<Settings>
      updateSettings(s: Settings): Promise<{ ok: true }>
      setSecret(key: string, value: string): Promise<{ ok: true }>
      getSecret(key: string): Promise<string | null>
      gmailStatus(): Promise<{ connected: boolean; email?: string; error?: string }>
      gmailConnect(): Promise<{ ok: boolean; email?: string; error?: string }>
      gmailSend(payload: { to: string; subject: string; text: string; bcc?: string }): Promise<
        | { ok: true; id: string; remaining: number; cap: number }
        | { ok: false; error: string }
      >
      gmailQuota(): Promise<{ used: number; cap: number; remaining: number }>
    }
  }
}
export {}
