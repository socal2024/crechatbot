export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + process.env.GOOGLE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const json = await response.json();
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' });
  }
}
