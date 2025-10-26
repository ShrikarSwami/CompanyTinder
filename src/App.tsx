import React, { useEffect, useState } from 'react'
import type { Settings } from './types'

/* ========================= Shell & UI bits ========================= */

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
        style={{
          padding: 8,
          borderRadius: 6,
          border: '1px solid #444',
          background: '#222',
          color: 'white',
        }}
      />
    </label>
  )
}

/* ============================ Setup form =========================== */

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
      if (!window.api) {
        console.warn('[CompanyTinder] Save skipped — window.api not available.')
        setSaved(true)
        setTimeout(onDone, 400)
        return
      }
      await window.api.updateSettings(form)
      if (gmailClientId) await window.api.setSecret('GMAIL_CLIENT_ID', gmailClientId)
      if (gmailClientSecret) await window.api.setSecret('GMAIL_CLIENT_SECRET', gmailClientSecret)
      if (googleApiKey) await window.api.setSecret('GOOGLE_API_KEY', googleApiKey)
      setSaved(true)
      setTimeout(onDone, 400)
    } catch (err) {
      console.error('[CompanyTinder] handleSave failed:', err)
      alert('Save failed. Check DevTools Console for details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      <h2>Setup</h2>

      <Section title="Profile">
        <Field
          label="Your name"
          value={form.sender_name}
          onChange={(v) => setForm({ ...form, sender_name: v })}
        />
        <Field
          label="Your email (sender)"
          value={form.sender_email}
          onChange={(v) => setForm({ ...form, sender_email: v })}
        />
        <Field label="School" value={form.school} onChange={(v) => setForm({ ...form, school: v })} />
        <Field
          label="Program"
          value={form.program}
          onChange={(v) => setForm({ ...form, program: v })}
        />
        <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field
          label="BCC list (comma-separated)"
          value={form.bcc_list}
          onChange={(v) => setForm({ ...form, bcc_list: v })}
        />
        <Field
          label="Daily send cap"
          value={String(form.daily_cap)}
          onChange={(v) => setForm({ ...form, daily_cap: Number(v.replace(/\D/g, '') || 0) })}
        />
      </Section>

      <Section title="Keys (stored in system keychain)">
        <Field label="Gmail OAuth Client ID" value={gmailClientId} onChange={setGmailClientId} />
        <Field
          label="Gmail OAuth Client Secret"
          value={gmailClientSecret}
          onChange={setGmailClientSecret}
          type="password"
        />
        <Field label="Google API Key (search)" value={googleApiKey} onChange={setGoogleApiKey} />
        <small style={{ opacity: 0.7 }}>
          We never write keys to disk. They are stored in macOS Keychain / Windows Credential
          Manager via Keytar.
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

/* =========================== Compose card ========================== */

function ComposeCard() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [useBcc, setUseBcc] = useState(true)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')

  const handleSend = async () => {
    try {
      setSending(true)
      setStatus('Sending…')

      const s = await window.api.getSettings()
      const res = await window.api.gmailSend({
        to: to.trim() || s.sender_email,
        subject: subject || 'CompanyTinder',
        text: body || '(no message)',
        bcc: useBcc ? s.bcc_list || '' : '',
      })

      setStatus(`Sent! Gmail ID: ${res.id}`)
      setBody('')
    } catch (err) {
      console.error(err)
      setStatus('Send failed — check console')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 12, border: '1px solid #333', borderRadius: 8 }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Compose</h3>

      <label style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="someone@example.com"
          style={{
            padding: 8,
            borderRadius: 6,
            border: '1px solid #444',
            background: '#222',
            color: 'white',
          }}
        />
      </label>

      <label style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          style={{
            padding: 8,
            borderRadius: 6,
            border: '1px solid #444',
            background: '#222',
            color: 'white',
          }}
        />
      </label>

      <label style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>Body</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Write your message..."
          style={{
            padding: 8,
            borderRadius: 6,
            border: '1px solid #444',
            background: '#222',
            color: 'white',
          }}
        />
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" checked={useBcc} onChange={(e) => setUseBcc(e.target.checked)} />
        <span style={{ fontSize: 13 }}>Send with BCC from Settings</span>
      </label>

      <button
        onClick={handleSend}
        disabled={sending}
        style={{
          background: sending ? '#666' : '#0ea5e9',
          color: 'white',
          border: 'none',
          padding: '8px 12px',
          borderRadius: 8,
          cursor: sending ? 'default' : 'pointer',
        }}
      >
        {sending ? 'Sending…' : 'Send'}
      </button>

      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>{status}</div>
    </div>
  )
}

/* ============================== App ================================ */

export default function App() {
  const [step, setStep] = useState<'welcome' | 'setup' | 'finder'>('welcome')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [hasApi, setHasApi] = useState(false)

  useEffect(() => {
    const api = window.api
    setHasApi(!!api)
    if (api) {
      api
        .getSettings()
        .then(setSettings)
        .catch((err) => {
          console.error('[CompanyTinder] getSettings failed:', err)
        })
    } else {
      console.warn('[CompanyTinder] window.api not available yet (preload)')
    }
  }, [])

  // --- Welcome screen ---
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

  // --- Setup screen ---
  if (step === 'setup') {
    return <Setup initial={settings ?? ({} as any)} onDone={() => setStep('finder')} />
  }

  // --- Finder screen ---
  return (
    <Shell>
      <h2>Finder</h2>
      <p>Setup complete. Next: add search adapter + session meter.</p>
      <ComposeCard />
    </Shell>
  )
}
