// Use the Settings type you already defined in src/types.ts
type Settings = import('./types').Settings

type GmailSendInput = {
  to: string
  subject: string
  text: string
  bcc?: string
}

declare global {
  interface Window {
    api: {
      // Settings (SQLite)
      getSettings(): Promise<Settings>
      updateSettings(payload: Settings): Promise<{ ok: true }>

      // Secrets (keytar)
      setSecret(key: string, value: string): Promise<{ ok: true }>
      getSecret(key: string): Promise<string | null>

      // Gmail
      gmailStatus(): Promise<{ connected: boolean; email?: string; error?: string }>
      gmailConnect(): Promise<{ ok: boolean; email?: string }>
      gmailSend(input: GmailSendInput): Promise<{ ok: true; id: string }>
    }
  }
}

export {}
