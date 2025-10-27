// src/Setup.tsx — add near your Gmail fields
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

{/* Setup UI block */}
<h3>Google Search (CSE)</h3>
<label>API Key</label>
<input value={googleApiKey} onChange={e=>setGoogleApiKey(e.target.value)} placeholder="AIza..." />
<label>Search Engine ID (cx)</label>
<input value={googleCx} onChange={e=>setGoogleCx(e.target.value)} placeholder="c4e505b0cfeef4886" />
<button onClick={saveGoogle}>Save CSE Keys</button>
