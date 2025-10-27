// src/types.d.ts

export type Settings = {
  sender_name: string;
  sender_email: string;
  school: string;
  program: string;
  city: string;
  bcc_list: string;
  daily_cap: number;
};

export type Hit = { title: string; link: string; domain: string; snippet: string };

export type CompanyRow = {
  id: string;
  name: string;
  domain: string;
  link: string;
  note: string;
  created_at: number;
  liked?: 1 | 0 | -1;
};

declare global {
  interface Window {
    api: {
      // Settings
      getSettings(): Promise<Settings>;
      updateSettings(payload: Settings): Promise<{ ok: true }>;

      // Secrets
      getSecret(key: string): Promise<string | null>;
      setSecret(key: string, val: string): Promise<{ ok: boolean }>;

      // Gmail
      gmailStatus(): Promise<{ connected: boolean; email?: string; error?: string }>;
      gmailConnect(): Promise<{ ok: boolean; email?: string }>;
      gmailSend(payload: {
        to: string; subject: string; text: string; bcc?: string;
      }): Promise<{ ok: boolean; id?: string; remaining?: number; cap?: number; error?: string }>;
      gmailQuota(): Promise<{ used: number; cap: number; remaining: number }>;

      // Search + Companies
      googleSearch(q: string): Promise<{ ok: boolean; error?: string; items?: Hit[] }>;
      companyAdd(input: { name: string; link: string; note?: string }): Promise<{ ok: boolean; error?: string }>;
      companyLike(domain: string, v: 1 | 0 | -1): Promise<{ ok: boolean }>;
      companyList?(): Promise<{ ok: boolean; items: CompanyRow[] }>;
    };
  }
}

export {}; // ensure this file is a module
