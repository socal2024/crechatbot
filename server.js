import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Store document
app.post('/add-document', async (req, res) => {
    const { content } = req.body;
    // Simple placeholder for embeddings (Gemini embeddings API could replace this)
    const embedding = Array(1536).fill(0); // TODO: replace with Gemini embeddings API
    await supabase.from('documents').insert([{ content, embedding }]);
    res.send({ success: true });
});

// Query documents and chat
app.post('/chat', async (req, res) => {
    const { query } = req.body;

    // Retrieve top 3 documents (stubbed similarity, ideally replace with Supabase pgvector search)
    const { data: docs } = await supabase.from('documents').select('*').limit(3);

    const context = docs.map(d => d.content).join("\n");

    const result = await model.generateContent([
        `You are a real estate investment assistant.`,
        `Context:\n${context}`,
        `User question: ${query}`
    ]);

    res.json({ answer: result.response.text() });
});

app.listen(3000, () => console.log("Server running on port 3000"));
