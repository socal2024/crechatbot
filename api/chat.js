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
    // 1) Embed the user's question
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
    if (!embedResp.ok) throw new Error(embedJson.error?.message || 'Embedding failed');
    const queryEmbedding = embedJson.embedding?.values;

    // 2) Search Supabase for top matching chunks
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
    if (!sbResp.ok) throw new Error(matches);

    // 3) Build context for Gemini
    const contextText = matches.map(m => m.content).join("\n---\n");
    const prompt = `Answer the question using only the context below. If the answer isn't in the context, say you don't know.\n\nContext:\n${contextText}\n\nQuestion:\n${message}`;

    // 4) Ask Gemini 2.0 Flash
    const genResp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + process.env.GOOGLE_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const genJson = await genResp.json();
    if (!genResp.ok) throw new Error(genJson.error?.message || 'Gemini call failed');

    const answer = genJson.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer';

    res.status(200).json({ reply: answer, sources: matches });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
