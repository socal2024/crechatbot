export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, chunks, metadata } = req.body || {};
  if (!title || !Array.isArray(chunks) || chunks.length === 0) {
    return res.status(400).json({ error: 'Missing title or chunks' });
  }

  try {
    // 1) Get embeddings for all chunks (Gemini embedding model, 3072-d by default)
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
          // Multiple chunks in one request (API supports batching)
          content: chunks.map(text => ({ parts: [{ text }] }))
          // Keeping defaults: 3072 dims, task type auto.
          // (Later you can switch to 768 dims for space savings)
        })
      }
    );

    const embedJson = await embedResp.json();
    if (!embedResp.ok) {
      return res.status(500).json({ error: `Embedding API error: ${embedJson.error?.message || 'unknown'}` });
    }
    const vectors = (embedJson.embeddings || []).map(e => e.values);
    if (vectors.length !== chunks.length) {
      return res.status(500).json({ error: 'Embedding count mismatch' });
    }

    // 2) Insert rows into Supabase via PostgREST (no SDK needed)
    const rows = chunks.map((content, i) => ({
      title,
      chunk_index: i,
      content,
      embedding: vectors[i], // pgvector accepts JSON array via PostgREST
      metadata: metadata || null
    }));

    const sbResp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'resolution=merge-duplicates' // harmless; allows array insert
      },
      body: JSON.stringify(rows)
    });

    if (!sbResp.ok) {
      const err = await sbResp.text();
      return res.status(500).json({ error: `Supabase insert failed: ${err}` });
    }

    res.status(200).json({ ok: true, inserted: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
