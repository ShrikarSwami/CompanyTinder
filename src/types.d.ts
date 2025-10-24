export {}

declare global {
  interface Window {
    api: {
      getSettings(): Promise<any>
      updateSettings(payload: any): Promise<{ ok: boolean; error?: string }>

      setSecret(key: string, value: string): Promise<{ ok: boolean; error?: string }>
      getSecret(key: string): Promise<string | null>
    }
  }
}
