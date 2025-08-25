import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.GEMINI_API_KEY });

// Store a document with embedding
app.post('/add-document', async (req, res) => {
    const { content } = req.body;
    const embedding = await openai.embeddings.create({
        model: "text-embedding-004",
        input: content
    });
    await supabase.from('documents').insert([{ content, embedding: embedding.data[0].embedding }]);
    res.send({ success: true });
});

// Query documents and respond
app.post('/chat', async (req, res) => {
    const { query } = req.body;
    const queryEmbedding = await openai.embeddings.create({
        model: "text-embedding-004",
        input: query
    });

    const { data } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding.data[0].embedding,
        match_count: 3
    });

    const context = data.map(d => d.content).join("\n");

    const response = await openai.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
            { role: "system", content: "You are a real estate investment assistant." },
            { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}` }
        ]
    });

    res.json({ answer: response.choices[0].message.content });
});

app.listen(3000, () => console.log("Server running on port 3000"));
