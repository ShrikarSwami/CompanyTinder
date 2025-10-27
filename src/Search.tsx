// src/Search.tsx
import { useEffect, useMemo, useState } from 'react';

type Hit = { title: string; link: string; domain: string; snippet: string };

export default function Search() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string|undefined>();

  async function run(qs: string) {
    if (!qs.trim()) return;
    setBusy(true); setError(undefined);
    const res = await window.api.googleSearch(qs);
    setBusy(false);
    if (!res?.ok) { setError(res?.error || 'Search failed'); setHits([]); return; }
    setHits(res.items || []);
  }

  // enter to search
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') run(q);
  }

  async function saveCompany(h: Hit) {
    const r = await window.api.companyAdd({ name: h.title, link: h.link, note: '' });
    if (!r?.ok) alert(r?.error || 'Save failed');
  }

  async function like(domain: string, v: 1 | -1 | 0) {
    await window.api.companyLike(domain, v); // we’ll add this IPC below
  }

  return (
    <div style={{padding:16,maxWidth:900}}>
      <h2>Find companies</h2>
      <div style={{display:'flex', gap:8}}>
        <input
          style={{flex:1}} value={q} onChange={e=>setQ(e.target.value)}
          onKeyDown={onKey} placeholder='eg. "HVAC distributors New Jersey email"'
        />
        <button disabled={busy} onClick={()=>run(q)}>{busy?'Searching…':'Search'}</button>
      </div>

      {error && <div style={{color:'#f55', marginTop:12}}>{error}</div>}

      <ul style={{marginTop:16, listStyle:'none', padding:0}}>
        {hits.map(h=>(
          <li key={h.link} style={{padding:'12px 0', borderBottom:'1px solid #333'}}>
            <div style={{fontWeight:600}}>{h.title}</div>
            <div style={{opacity:.8, fontSize:13}}>{h.domain}</div>
            <div style={{margin:'6px 0'}}>{h.snippet}</div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={()=>saveCompany(h)}>Save</button>
              <button title="Heart" onClick={()=>like(h.domain, 1)}>❤️</button>
              <button title="Nope" onClick={()=>like(h.domain, -1)}>✖️</button>
              <a href={h.link} target="_blank">Open</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
