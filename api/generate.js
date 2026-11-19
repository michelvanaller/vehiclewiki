// VEHORA Maximaal — Beveiligd AI-endpoint
// Stap 1C: JWT-verificatie + beheerder-check + invoervalidatie + dry-run.
// Schrijft nooit wachtwoorden, JWT's of geheime sleutels naar logs.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode niet toegestaan' });

  // --- Bodygrootte-check ---
  // Vercel parseert de body voordat de handler draait; deze check vindt dus
  // na ontvangst en parsing plaats en is geen netwerklaagbescherming.
  // Vercel's platform-limiet is 4,5 MB; hier beperken we tot ~16 KiB
  // zodat oversized aanvragen worden geweigerd vóór de Anthropic-aanroep.
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 16384) {
    return res.status(413).json({ error: 'Verzoek te groot' });
  }
  // Aanvullende check op de feitelijk ontvangen inhoud (Content-Length kan
  // ontbreken of onjuist zijn).
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Ongeldig verzoek' });
  }
  const bodyJson = JSON.stringify(req.body);
  if (bodyJson.length > 16384) {
    return res.status(413).json({ error: 'Verzoek te groot' });
  }

  // --- JWT uit Authorization-header ---
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authenticatie vereist' });
  }

  // --- Omgevingsvariabelen ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VEHORA generate: omgevingsvariabelen ontbreken (SUPABASE_URL of SUPABASE_ANON_KEY)');
    return res.status(500).json({ error: 'Serverconfiguratie onvolledig' });
  }

  // --- Server-side JWT-verificatie via Supabase Auth ---
  let userId;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
    }
    const userData = await userRes.json();
    userId = userData?.id;
  } catch (e) {
    console.error('VEHORA generate: fout bij JWT-verificatie');
    return res.status(500).json({ error: 'Verificatie mislukt' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Gebruiker niet gevonden' });
  }

  // --- Beheerder-check ---
  const adminUserId = process.env.VEHORA_ADMIN_USER_ID;
  if (!adminUserId) {
    console.error('VEHORA generate: VEHORA_ADMIN_USER_ID ontbreekt in omgeving');
    return res.status(500).json({ error: 'Beheerdersconfiguratie ontbreekt' });
  }
  if (userId !== adminUserId) {
    return res.status(403).json({ error: 'Geen beheerdersrechten' });
  }

  // --- Invoervalidatie ---
  const { prompt, max_tokens, dryRun } = req.body;

  // max_tokens: verplicht, geheel getal, 1–1500
  if (!Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > 1500) {
    return res.status(400).json({ error: 'max_tokens moet een geheel getal zijn tussen 1 en 1500' });
  }

  // prompt: verplicht, string, niet leeg, max 4000 tekens — nooit stilzwijgend afkappen
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is verplicht en mag niet leeg zijn' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'prompt mag maximaal 4000 tekens bevatten' });
  }

  // --- Dry-run: authenticatie en validatie geslaagd, geen Anthropic-aanroep ---
  if (dryRun === true) {
    return res.status(200).json({ dryRun: true, ok: true, bericht: 'Authenticatie geslaagd (dryRun)' });
  }

  // --- Anthropic API-aanroep (alleen na volledige verificatie en validatie) ---
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        system: 'Geef ALTIJD alleen pure JSON terug. Geen markdown, geen ```json```, geen uitleg. Alleen de JSON zelf.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (e) {
    console.error('VEHORA generate: fout bij Anthropic-aanroep');
    return res.status(500).json({ error: 'AI-aanroep mislukt' });
  }
}
