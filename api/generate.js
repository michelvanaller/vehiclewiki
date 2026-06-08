fetch('/api/generate', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({prompt: 'Zeg hallo in het Nederlands'})
}).then(r => r.json()).then(d => console.log(d))
