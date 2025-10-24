import { useEffect, useState } from 'react'

type Settings = {
  sender_name: string
  sender_email: string
  school: string
  program: string
  city: string
  bcc_list: string
  daily_cap: number
}

export default function App() {
  const [step, setStep] = useState<'welcome' | 'setup' | 'finder'>('welcome')
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.api.getSettings().then((s) => setSettings(s))
  }, [])

  if (step === 'welcome') {
    return (
      <div style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
        <h1>CompanyTinder</h1>
        <p>Scaffold running. Next: Setup Wizard, sessions, Gmail, search adapters.</p>
        <ol>
          <li>Connect Gmail</li>
          <li>Enter API keys</li>
          <li>Find companies</li>
          <li>Review → Compose → Send (with BCC)</li>
        </ol>
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('setup')}>Open Setup</button>
          <button onClick={() => setStep('finder')}>Skip for now</button>
        </div>
      </div>
    )
  }

  if (step === 'setup') {
    return <Setup initial={settings as any} onDone={() => setStep('finder')} />
  }

  return (
    <div style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Finder</h2>
      <p>Setup complete. Next step: add search adapter + session meter.</p>
    </div>
  )
}

function Setup({
  initial,
  onDone
}: {
  initial: Partial<Settings>
  onDone: () => void
}) {
  const [form, setForm] = useState<Settings>({
    sender_name: initial?.sender_name || '',
    sender_email: initial?.sender_email || '',
    school: initial?.school || '',
    program: initial?.program || '',
    city: initial?.city || '',
    bcc_list: initial?.bcc_list || '',
    daily_cap: Number(initial?.daily_cap || 25)
  })

  const [gmailClientId, setGmailClientId] = useState('')
  const [gmailClientSecret, setGmailClientSecret] = useState('')
  const [googleApiKey, setGoogleApiKey] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipSecrets, setSkipSecrets] = useState(false)

  const [verify, setVerify] = useState<any | null>(null)
  const [secretsOK, setSecretsOK] = useState<{ gmailId?: boolean; gmailSecret?: boolean; googleKey?: boolean }>({})

  async function checkSaved() {
    const s = await window.api.getSettings()
    const id = await window.api.getSecret('GMAIL_CLIENT_ID')
    const secret = await window.api.getSecret('GMAIL_CLIENT_SECRET')
    const gkey = await window.api.getSecret('GOOGLE_API_KEY')
    setVerify(s)
    setSecretsOK({
      gmailId: Boolean(id),
      gmailSecret: Boolean(secret),
      googleKey: Boolean(gkey),
    })
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await window.api.updateSettings(form)
      if (!res?.ok) throw new Error('settings update failed')

      if (!skipSecrets) {
        if (gmailClientId) {
          const r = await window.api.setSecret('GMAIL_CLIENT_ID', gmailClientId)
          if (!r?.ok) throw new Error('failed to save Gmail Client ID')
        }
        if (gmailClientSecret) {
          const r = await window.api.setSecret('GMAIL_CLIENT_SECRET', gmailClientSecret)
          if (!r?.ok) throw new Error('failed to save Gmail Client Secret')
        }
        if (googleApiKey) {
          const r = await window.api.setSecret('GOOGLE_API_KEY', googleApiKey)
          if (!r?.ok) throw new Error('failed to save Google API Key')
        }
      }

      setSaved(true)
      setTimeout(onDone, 400)
    } catch (e: any) {
      console.error('Save failed', e)
      setError(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 560, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Setup</h2>

      <Section title="Profile">
        <Field label="Your name" value={form.sender_name} onChange={(v) => setForm({ ...form, sender_name: v })} />
        <Field label="Your email (sender)" value={form.sender_email} onChange={(v) => setForm({ ...form, sender_email: v })} />
        <Field label="School" value={form.school} onChange={(v) => setForm({ ...form, school: v })} />
        <Field label="Program" value={form.program} onChange={(v) => setForm({ ...form, program: v })} />
        <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field label="BCC list (comma-separated)" value={form.bcc_list} onChange={(v) => setForm({ ...form, bcc_list: v })} />
        <Field
          label="Daily send cap"
          value={String(form.daily_cap)}
          onChange={(v) => setForm({ ...form, daily_cap: Number(v.replace(/\D/g, '') || 0) })}
        />
      </Section>

      <Section title="Keys (stored in system keychain)">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input type="checkbox" checked={skipSecrets} onChange={(e) => setSkipSecrets(e.target.checked)} />
          <span>Skip saving secrets for now</span>
        </label>
        <Field label="Gmail OAuth Client ID" value={gmailClientId} onChange={setGmailClientId} />
        <Field label="Gmail OAuth Client Secret" value={gmailClientSecret} onChange={setGmailClientSecret} type="password" />
        <Field label="Google API Key (search)" value={googleApiKey} onChange={setGoogleApiKey} />
        <small style={{ opacity: 0.7 }}>
          We never write keys to disk. They are stored in macOS Keychain / Windows Credential Manager via Keytar.
        </small>
      </Section>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
        <button onClick={checkSaved}>Check Saved</button>
        {saved && <span style={{ color: '#22c55e' }}>Saved!</span>}
        {error && <span style={{ color: '#ef4444' }}>Error: {error}</span>}
      </div>

      {verify && (
        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.9 }}>
          <div><b>Settings</b>: {JSON.stringify(verify)}</div>
          <div><b>Secrets</b>: {JSON.stringify(secretsOK)}</div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, borderRadius: 6, border: '1px solid #444' }}
      />
    </label>
  )
}
