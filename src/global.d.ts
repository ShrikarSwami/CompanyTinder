export {}; // make this a module so global augmentation works

import type { Settings } from './types';

declare global {
  interface Window {
    api: {
      getSettings: () => Promise<Settings | null>;
      updateSettings: (payload: Partial<Settings>) => Promise<{ ok: boolean }>;

      setSecret: (key: string, value: string) => Promise<{ ok: boolean }>;
      getSecret: (key: string) => Promise<string | null>;
    };
  }
}
