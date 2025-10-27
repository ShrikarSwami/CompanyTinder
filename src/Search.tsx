import React, { useState } from 'react';

export type Hit = { title: string; link: string; domain: string; snippet: string };


export default function Search() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [items, setItems] = useState<Hit[]>([]);

  async function run(qs: string) {
    const s = qs.trim();
    if (!s) return;
    setBusy(true);
    setError(undefined);
    const res = await window.api.googleSearch(s);
    setBusy(false);
    if (!res?.ok) {
      setError(res?.error || 'Search failed');
      setItems([]);
      return;
    }
    setItems(res.items ?? []);
  }

  async function saveCompany(h: Hit) {
    const r = await window.api.companyAdd({ name: h.title, link: h.link, note: '' });
    if (!r?.ok) alert(r?.error || 'Save failed');
  }

  async function like(domain: string, v: 1 | 0 | -1) {
    await window.api.companyLike(domain, v);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') run(q);
  }

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h2>Find companies</h2>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={'eg. "HVAC distributors New Jersey email"'}
        />
        <button disabled={busy} onClick={() => run(q)}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div style={{ color: '#f55', marginTop: 12 }}>{error}</div>}

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {items.map((h) => (
          <li key={h.link} style={{ padding: '12px 0', borderBottom: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{h.title}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{h.domain}</div>
                <div style={{ marginTop: 6 }}>{h.snippet}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                <button onClick={() => saveCompany(h)}>Save</button>
                <button title="Heart" onClick={() => like(h.domain, 1)}>❤️</button>
                <button title="Nope" onClick={() => like(h.domain, -1)}>✖️</button>
                <a href={h.link} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
