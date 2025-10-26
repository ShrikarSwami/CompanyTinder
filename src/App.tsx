import { useEffect, useMemo, useState } from 'react'
import type { Settings } from './types'

type Quota = { used: number; cap: number; remaining: number }

export default function App() {
  const [step, setStep] = useState<'welcome' | 'setup' | 'finder'>('welcome')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [hasApi, setHasApi] = useState(false)
  const [gmailEmail, setGmailEmail] = useState<string | undefined>()
  const [quota, setQuota] = useState<Quota>({ used: 0, cap: 25, remaining: 25 })

  // preload bridge + initial data
  useEffect(() => {
    const api = window.api
    setHasApi(!!api)
    if (!api) return

    api.getSettings().then(setSettings).catch((e) => {
      console.error('[CompanyTinder] getSettings failed:', e)
    })

    api.gmailStatus().then((s) => {
      if (s.connected) setGmailEmail(s.email)
    })

    api.gmailQuota().then(setQuota).catch(() => {})
  }, [])

  if (step === 'welcome') {
    return (
      <Shell>
        <h1 style={{ fontSize: 44, marginBottom: 12 }}>CompanyTinder</h1>
        <p style={{ opacity: 0.85, marginBottom: 12 }}>
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
            ⚠️ Preload bridge (window.api) not detected yet. You can still open Setup; data won’t persist until preload is available.
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
    return (
      <Setup
        initial={settings ?? ({} as any)}
        onDone={() => {
          setStep('finder')
          // refresh settings/quota after setup
          if (window.api) {
            window.api.getSettings().then(setSettings)
            window.api.gmailStatus().then((s) => s.connected && setGmailEmail(s.email))
            window.api.gmailQuota().then(setQuota)
          }
        }}
      />
    )
  }

  return (
    <Shell>
      <Header
        gmailEmail={gmailEmail}
        quota={quota}
        onRefresh={async () => {
          if (!window.api) return
          setSettings(await window.api.getSettings())
          const qs = await window.api.gmailQuota()
          setQuota(qs)
          const st = await window.api.gmailStatus()
          if (st.connected) setGmailEmail(st.email)
        }}
      />

      <p style={{ opacity: 0.85, marginBottom: 14 }}>
        Setup complete. Next: add search adapter + session meter.
      </p>

      <ComposeCard
        settings={settings}
        quota={quota}
        onSent={async () => {
          if (!window.api) return
          const qs = await window.api.gmailQuota()
          setQuota(qs)
        }}
      />
    </Shell>
  )
}

/* -------------------------------- UI bits -------------------------------- */

function Header({
  gmailEmail,
  quota,
  onRefresh,
}: {
  gmailEmail?: string
  quota: Quota
  onRefresh: () => void
}) {
  const pct = useMemo(() => {
    if (!quota.cap) return 0
    return Math.min(100, Math.round((quota.used / quota.cap) * 100))
  }, [quota])

  const overCap = quota.remaining <= 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 600 }}>
        {gmailEmail ? `Gmail: ${gmailEmail}` : 'Gmail: not connected'}
      </div>

      <div style={{ flex: 1, maxWidth: 420 }}>
        <div style={{
          height: 8,
          background: '#222',
          border: '1px solid #333',
          borderRadius: 999,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: overCap ? '#ef4444' : '#22c55e',
            transition: 'width 300ms ease'
          }} />
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          {quota.used}/{quota.cap} sent today • {quota.remaining} remaining
        </div>
      </div>

      <button onClick={onRefresh}>Refresh</button>
    </div>
  )
}

function ComposeCard({
  settings,
  quota,
  onSent,
}: {
  settings: Settings | null
  quota: Quota
  onSent: () => void
}) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [useBcc, setUseBcc] = useState(true)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<string>('')

  const disabled = sending || !window.api || quota.remaining <= 0

  async function handleSend() {
    try {
      setSending(true)
      setStatus('Sending…')

      const bcc = useBcc ? (settings?.bcc_list || '') : ''
      const res = await window.api.gmailSend({
        to: to || (settings?.sender_email || ''),
        subject: subject || 'CompanyTinder test ✅',
        text: body || 'Hello from CompanyTinder! This was sent through the app.',
        bcc,
      })

      if (res.ok) {
        setStatus(`Sent! Gmail ID: ${res.id}`)
        setTo(''); setSubject(''); setBody('')
        onSent()
      } else {
        setStatus(res.error || 'Send failed.')
      }
    } catch (e) {
      console.error(e)
      setStatus('Send failed — check console.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{
      border: '1px solid #333',
      borderRadius: 10,
      padding: 16,
      width: 440,
      background: '#121212'
    }}>
      <h3 style={{ marginTop: 0 }}>Compose</h3>

      <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>To</span>
        <input
          placeholder="someone@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>Subject</span>
        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>Body</span>
        <textarea
          placeholder="Write your message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6 }}>
        <input
          type="checkbox"
          checked={useBcc}
          onChange={(e) => setUseBcc(e.target.checked)}
        />
        <span>Send with BCC from Settings</span>
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button disabled={disabled} onClick={handleSend}>
          {sending ? 'Sending…' : quota.remaining <= 0 ? 'Cap reached' : 'Send'}
        </button>
        <span style={{ fontSize: 13, opacity: 0.8 }}>{status}</span>
      </div>
    </div>
  )
}

function Setup({ initial, onDone }: { initial: Partial<Settings>, onDone: () => void }) {
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
    setSaving(true); setSaved(false)
    try {
      if (!window.api) {
        console.warn('[CompanyTinder] Save skipped — window.api not available.')
        setSaved(true); setTimeout(onDone, 400)
        return
      }
      await window.api.updateSettings(form)
      if (gmailClientId) await window.api.setSecret('GMAIL_CLIENT_ID', gmailClientId)
      if (gmailClientSecret) await window.api.setSecret('GMAIL_CLIENT_SECRET', gmailClientSecret)
      if (googleApiKey) await window.api.setSecret('GOOGLE_API_KEY', googleApiKey)
      setSaved(true); setTimeout(onDone, 400)
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
          We never write keys to disk. They are stored in macOS Keychain / Windows Credential Manager via Keytar.
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

/* -------------------------------- small helpers -------------------------------- */

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: '1px solid #333',
  background: '#1b1b1b',
  color: 'white',
  outline: 'none',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui', color: 'white', background: '#111', minHeight: '100vh' }}>
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

function Field({ label, value, onChange, type = 'text' }:{
  label: string; value: string; onChange:(v: string)=>void; type?: string
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  )
}
