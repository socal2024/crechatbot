# export default async function handler(req, res) {
#  if (req.method !== 'POST') {
#    return res.status(405).json({ error: 'Method not allowed' });
#  }
#
#  const { message } = req.body;
#  if (!message) {
#    return res.status(400).json({ error: 'Missing message' });
#  }
#
#  try {
#    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + process.env.GOOGLE_API_KEY, {
#      method: 'POST',
#      headers: { 'Content-Type': 'application/json' },
#      body: JSON.stringify({
#        contents: [{ parts: [{ text: message }] }]
#      })
#    });
#
#    const json = await response.json();
#    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
#    res.status(200).json({ reply });
#  } catch (error) {
#    res.status(500).json({ error: 'Something went wrong' });
#  }
# }
#
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Missing message' });

  try {
    // 1) Embed user question
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
          content: { parts: [{ text: message }] }
        })
      }
    );
    const embedJson = await embedResp.json();
    if (!embedResp.ok) {
      return res.status(500).json({ error: embedJson.error?.message || 'Embedding failed' });
    }
    const queryEmbedding = embedJson.embedding?.values;
    if (!queryEmbedding) {
      return res.status(500).json({ error: 'No embedding returned from Gemini' });
    }

    // 2) Search Supabase
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
    const matches = await sbResp.json();
    if (!sbResp.ok) {
      return res.status(500).json({ error: `Supabase error: ${JSON.stringify(matches)}` });
    }

    if (!matches || matches.length === 0) {
      return res.status(200).json({
        reply: "No relevant information found in your documents.",
        sources: []
      });
    }

    // 3) Build context prompt
    const contextText = matches.map(m => m.content).join("\n---\n");
    const prompt = `You are an assistant answering questions based on the provided context.
Answer the question using only the context below. If the answer isn't in the context, say "I don't know".

Context:
${contextText}

Question:
${message}`;

    // 4) Ask Gemini 2.0 Flash
    const genResp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + process.env.GOOGLE_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );
    const genJson = await genResp.json();
    if (!genResp.ok) {
      return res.status(500).json({ error: `Gemini error: ${genJson.error?.message}` });
    }

    const answer = genJson.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer found.';

    res.status(200).json({ reply: answer, sources: matches });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
