// src/App.tsx
import { useEffect, useState } from 'react'
import type { Settings } from './types'

type Quota = { used: number; cap: number; remaining: number }

export default function App() {
  const [step, setStep] = useState<'welcome' | 'setup' | 'finder'>('welcome')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [hasApi, setHasApi] = useState(false)

  useEffect(() => {
    const api = window.api
    setHasApi(!!api)
    if (!api) return

    api.getSettings().then(setSettings).catch((e) => console.error('[getSettings]', e))
    api.gmailQuota().then(setQuota).catch(() => {})
  }, [])

  if (step === 'welcome') {
    return (
      <Shell>
        <h1 style={{ fontSize: 44, marginBottom: 12 }}>CompanyTinder</h1>
        <p style={{ opacity: 0.8, marginBottom: 12 }}>
          Scaffold running. Next: Setup Wizard, sessions, Gmail, search adapters.
        </p>
        <ol style={{ lineHeight: 1.7, marginLeft: 20, opacity: 0.9 }}>
          <li>Connect Gmail</li>
          <li>Enter API keys</li>
          <li>Find companies</li>
          <li>Review → Compose → Send (with BCC)</li>
        </ol>

        {!hasApi && (
          <div style={{ marginTop: 12, color: '#f59e0b' }}>
            ⚠️ Preload bridge (window.api) not detected yet. You can still open Setup; data won’t
            persist until preload is available.
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('setup')}>Open Setup</button>
          <button onClick={() => setStep('finder')}>Skip for now</button>
        </div>
      </Shell>
    )
  }

  if (step === 'setup') {
    return <Setup initial={settings ?? ({} as any)} onDone={() => setStep('finder')} />
  }

  return (
    <Shell>
      <h2>Finder</h2>
      <p>Setup complete. Next: add search adapter + session meter.</p>

      <QuotaBar quota={quota} />
      <ComposeCard
        onSent={() => {
          // refresh the quota bar after each send
          window.api.gmailQuota().then(setQuota).catch(() => {})
        }}
      />
    </Shell>
  )
}

/* ---------------- UI bits ---------------- */

function QuotaBar({ quota }: { quota: Quota | null }) {
  if (!quota) return null
  const pct = quota.cap ? Math.min(100, Math.round((quota.used / quota.cap) * 100)) : 0
  return (
    <div style={{ margin: '12px 0 20px 0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          opacity: 0.8,
          marginBottom: 4,
        }}
      >
        <span>Daily quota</span>
        <span>
          {quota.used}/{quota.cap} used (left {quota.remaining})
        </span>
      </div>
      <div style={{ height: 8, background: '#333', borderRadius: 6, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct > 90 ? '#ef4444' : '#22c55e',
          }}
        />
      </div>
    </div>
  )
}

function ComposeCard({ onSent }: { onSent: () => void }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [withBcc, setWithBcc] = useState(true)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')

  const send = async () => {
    try {
      setSending(true)
      setStatus('Sending…')
      const s = await window.api.getSettings()
      const res = await window.api.gmailSend({
      to: to || s.sender_email,
      subject: subject || 'CompanyTinder test ✅',
      text: body || 'Hello from CompanyTinder!',
      bcc: withBcc ? s.bcc_list || '' : '',
    })

    if (res.ok) {
      setStatus(`Sent! Gmail ID: ${res.id}`)
      onSent()
    } else {
      setStatus(res.error ?? 'Failed to send.')
    }

    } catch (e: unknown) {
      console.error(e)
      setStatus('Error. See console.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginTop: 16, maxWidth: 520, border: '1px solid #333', borderRadius: 8, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Compose</h3>

      <Field label="To" value={to} onChange={setTo} placeholder="someone@example.com" />
      <Field label="Subject" value={subject} onChange={setSubject} placeholder="Subject" />
      <TextArea label="Body" value={body} onChange={setBody} placeholder="Write your message..." />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9 }}>
        <input type="checkbox" checked={withBcc} onChange={(e) => setWithBcc(e.target.checked)} />
        Send with BCC from Settings
      </label>

      <div style={{ marginTop: 10 }}>
        <button disabled={sending} onClick={send}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>{status}</div>
      </div>
    </div>
  )
}

function Setup({ initial, onDone }: { initial: Partial<Settings>; onDone: () => void }) {
  const [form, setForm] = useState<Settings>({
    sender_name: initial.sender_name || '',
    sender_email: initial.sender_email || '',
    school: initial.school || '',
    program: initial.program || '',
    city: initial.city || '',
    bcc_list: initial.bcc_list || '',
    daily_cap: Number(initial.daily_cap || 25),
  })

  const [gmailClientId, setGmailClientId] = useState('')
  const [gmailClientSecret, setGmailClientSecret] = useState('')
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await window.api.updateSettings(form)
      if (gmailClientId) await window.api.setSecret('GMAIL_CLIENT_ID', gmailClientId)
      if (gmailClientSecret) await window.api.setSecret('GMAIL_CLIENT_SECRET', gmailClientSecret)
      if (googleApiKey) await window.api.setSecret('GOOGLE_API_KEY', googleApiKey)
      setSaved(true)
      setTimeout(onDone, 400)
    } catch (err) {
      console.error('[Setup] save failed:', err)
      alert('Save failed. Check DevTools console.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
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
        <Field label="Gmail OAuth Client ID" value={gmailClientId} onChange={setGmailClientId} />
        <Field label="Gmail OAuth Client Secret" value={gmailClientSecret} onChange={setGmailClientSecret} type="password" />
        <Field label="Google API Key (search)" value={googleApiKey} onChange={setGoogleApiKey} />
        <small style={{ opacity: 0.7 }}>
          Keys are stored in macOS Keychain / Windows Credential Manager via Keytar.
        </small>
      </Section>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
        {saved && <span style={{ color: '#22c55e' }}>Saved!</span>}
      </div>
    </Shell>
  )
}

/* ---------------- styled minis ---------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui',
        color: 'white',
        background: '#111',
        minHeight: '100vh',
      }}
    >
      {children}
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
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#222', color: 'white' }}
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        style={{
          padding: 8,
          borderRadius: 6,
          border: '1px solid #444',
          background: '#222',
          color: 'white',
          resize: 'vertical',
        }}
      />
    </label>
  )
}
