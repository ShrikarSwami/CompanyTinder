  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await window.api.updateSettings(form)
      if (gmailClientId) await window.api.setSecret('GMAIL_CLIENT_ID', gmailClientId)
      if (gmailClientSecret) await window.api.setSecret('GMAIL_CLIENT_SECRET', gmailClientSecret)
      if (googleApiKey) await window.api.setSecret('GOOGLE_API_KEY', googleApiKey)
      setSaved(true)
      setTimeout(onDone, 500)
    } finally {
      setSaving(false)
    }
  }
