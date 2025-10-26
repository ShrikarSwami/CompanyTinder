// src/types.d.ts (augment the window type)
export type Settings = {
  sender_name: string
  sender_email: string
  school: string
  program: string
  city: string
  bcc_list: string
  daily_cap: number
}

declare global {
  interface Window {
    api: {
      getSettings(): Promise<Settings>
      updateSettings(payload: Settings): Promise<{ ok: true }>
      setSecret(key: string, value: string): Promise<{ ok: true }>
      getSecret(key: string): Promise<string | null>
      gmailStatus(): Promise<{ connected: boolean; email?: string; error?: string }>
      gmailConnect(): Promise<{ ok: boolean; email?: string }>
      gmailSend(payload: { to: string; subject: string; text: string; bcc?: string }): Promise<{ ok: boolean; id?: string; remaining?: number; cap?: number; error?: string }>
      gmailQuota(): Promise<{ used: number; cap: number; remaining: number }>
    }
  }
}
export {}
