import React, { useEffect, useState } from 'react';

export default function Setup() {
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [googleCx, setGoogleCx] = useState('');

  useEffect(() => {
    (async () => {
      setGoogleApiKey((await window.api.getSecret('GOOGLE_API_KEY')) ?? '');
      setGoogleCx((await window.api.getSecret('GOOGLE_CSE_CX')) ?? '');
    })();
  }, []);

  async function saveGoogle() {
    await window.api.setSecret('GOOGLE_API_KEY', googleApiKey.trim());
    await window.api.setSecret('GOOGLE_CSE_CX', googleCx.trim());
    alert('Saved Google CSE keys!');
  }

  return (
    <div style={{ padding: 16, maxWidth: 700 }}>
      <h3>Google Search (CSE)</h3>

      <label>API Key</label>
      <input
        value={googleApiKey}
        onChange={(e) => setGoogleApiKey(e.target.value)}
        placeholder="AIza…"
        style={{ width: '100%', marginBottom: 8 }}
      />

      <label>Search Engine ID (cx)</label>
      <input
        value={googleCx}
        onChange={(e) => setGoogleCx(e.target.value)}
        placeholder="c4e505b0cfeef4886"
        style={{ width: '100%', marginBottom: 12 }}
      />

      <button onClick={saveGoogle}>Save CSE Keys</button>
    </div>
  );
}
