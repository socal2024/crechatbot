# export default async function handler(req, res) {
#  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
#
#  const { title, chunks, metadata } = req.body || {};
#  if (!title || !Array.isArray(chunks) || chunks.length === 0) {
#    return res.status(400).json({ error: 'Missing title or chunks' });
#  }
#
#  try {
#    const vectors = [];
#
#    // 1) Get embedding for each chunk separately
#    for (const text of chunks) {
#      const resp = await fetch(
#        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
#        {
#          method: 'POST',
#          headers: {
#            'Content-Type': 'application/json',
#            'x-goog-api-key': process.env.GOOGLE_API_KEY
#          },
#          body: JSON.stringify({
#            model: 'models/gemini-embedding-001',
#            content: { parts: [{ text }] }
#          })
#        }
#      );
#
#      const json = await resp.json();
#      if (!resp.ok) {
#        throw new Error(json.error?.message || 'Embedding failed');
#      }
#
#      vectors.push(json.embedding?.values);
#    }
#
#    // 2) Prepare rows for Supabase
#    const rows = chunks.map((content, i) => ({
#      title,
#      chunk_index: i,
#      content,
#      embedding: vectors[i],
#      metadata: metadata || null
#    }));
#
#    // 3) Insert into Supabase
#    const sbResp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documents`, {
#      method: 'POST',
#      headers: {
#        'Content-Type': 'application/json',
#        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
#        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
#        'Prefer': 'resolution=merge-duplicates'
#      },
#      body: JSON.stringify(rows)
#   });
#
#    if (!sbResp.ok) {
#      const err = await sbResp.text();
#      return res.status(500).json({ error: `Supabase insert failed: ${err}` });
#    }
#
#    res.status(200).json({ ok: true, inserted: rows.length });
#  } catch (err) {
#    res.status(500).json({ error: err.message || 'Unexpected error' });
#  }
# }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, chunks, metadata } = req.body || {};
  if (!title || !Array.isArray(chunks) || chunks.length === 0) {
    return res.status(400).json({ error: 'Missing title or chunks' });
  }

  try {
    const vectors = [];

    // 1) Get embedding for each chunk separately
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GOOGLE_API_KEY
          },
          body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] }
          })
        }
      );

      const json = await resp.json();
      if (!resp.ok) {
        return res.status(500).json({ error: `Embedding failed at chunk ${i}: ${json.error?.message || 'unknown error'}` });
      }

      if (!json.embedding?.values) {
        return res.status(500).json({ error: `No embedding returned for chunk ${i}` });
      }

      vectors.push(json.embedding.values);
    }

    // 2) Prepare rows for Supabase
    const rows = chunks.map((content, i) => ({
      title,
      chunk_index: i,
      content,
      embedding: vectors[i],
      metadata: metadata || null
    }));

    // 3) Insert into Supabase
    const sbResp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    });

    if (!sbResp.ok) {
      const errText = await sbResp.text();
      return res.status(500).json({ error: `Supabase insert failed (${sbResp.status}): ${errText}` });
    }

    res.status(200).json({ ok: true, inserted: rows.length });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
