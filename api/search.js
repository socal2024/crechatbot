export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    // 1) Embed the user query
    const embedResp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GOOGLE_API_KEY
        },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: query }] }
        })
      }
    );

    const embedJson = await embedResp.json();
    if (!embedResp.ok) throw new Error(embedJson.error?.message || 'Embedding failed');
    const queryEmbedding = embedJson.embedding?.values;

    // 2) Call Supabase RPC to get top matches
    const sbResp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/match_documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_count: 5,
        similarity_threshold: 0.7
      })
    });

    const results = await sbResp.json();
    if (!sbResp.ok) throw new Error(results);

    res.status(200).json({ matches: results });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
