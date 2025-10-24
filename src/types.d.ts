export {}

declare global {
  interface Window {
    api: {
      getSettings(): Promise<any>
      updateSettings(payload: any): Promise<{ ok: boolean }>
      setSecret(key: string, value: string): Promise<{ ok: boolean }>
      getSecret(key: string): Promise<string | null>
    }
  }
}
