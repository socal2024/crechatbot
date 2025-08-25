import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables (works locally, Vercel injects automatically in production)
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- Supabase Setup ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Gemini Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

// --- Routes ---

// Add a document to Supabase with embedding
app.post('/api/add-document', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required and must be a string' });
    }

    const { embedding } = await embedModel.embedContent(content);

    const { error } = await supabase.from('documents').insert([
      { content, embedding: embedding.values }
    ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Add document error:', err);
    res.status(500).json({ error: 'Failed to add document' });
  }
});

// Chat endpoint: query Supabase + answer via Gemini
app.post('/api/chat', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' });
    }

    const { embedding } = await embedModel.embedContent(query);

    const { data: matches, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding.values,
      match_count: 3
    });

    if (error) throw error;

    const context = (matches || []).map(m => m.content).join('\n');

    const prompt = [
      'You are a helpful real estate investing assistant.',
      `Use this context to answer: ${context || '(no relevant context found)'}`,
      `Question: ${query}`
    ];

    const result = await chatModel.generateContent([{ text: prompt.join('\n') }]);
    const answer = result.response?.text?.() || '';

    res.json({ answer, matches: matches || [] });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

// --- Export for Vercel ---
export default app;
