// VEHORA Maximaal — Beveiligd admin-endpoint (stub)
// Stap 1B: JWT-verificatie + beheerder-check. Geen schrijflogica.
// Schrijft nooit wachtwoorden, JWT's of geheime sleutels naar logs.

export default async function handler(req, res) {
  // Alleen POST toegestaan
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode niet toegestaan' });
  }

  // Haal JWT uit Authorization-header
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authenticatie vereist' });
  }

  // Verifieer het JWT via de Supabase Auth REST API
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VEHORA admin-write: omgevingsvariabelen ontbreken (SUPABASE_URL of SUPABASE_ANON_KEY)');
    return res.status(500).json({ error: 'Serverconfiguratie onvolledig' });
  }

  let userId;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!userRes.ok) {
      // Token ongeldig of verlopen — geen details blootstellen
      return res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
    }

    const userData = await userRes.json();
    userId = userData?.id;
  } catch (e) {
    console.error('VEHORA admin-write: fout bij JWT-verificatie');
    return res.status(500).json({ error: 'Verificatie mislukt' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Gebruiker niet gevonden' });
  }

  // Vergelijk geverifieerde user-ID met de vaste beheerder-UUID
  const adminUserId = process.env.VEHORA_ADMIN_USER_ID;
  if (!adminUserId) {
    console.error('VEHORA admin-write: VEHORA_ADMIN_USER_ID ontbreekt in omgeving');
    return res.status(500).json({ error: 'Beheerdersconfiguratie ontbreekt' });
  }

  if (userId !== adminUserId) {
    // Geldig JWT, maar niet de beheerder
    return res.status(403).json({ error: 'Geen beheerdersrechten' });
  }

  // Verificatie geslaagd — stub geeft alleen bevestiging terug, geen schrijflogica
  return res.status(200).json({ ok: true, bericht: 'Authenticatie geslaagd (stub)' });
}
