import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Gemini clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Add a document (store its embedding)
app.post('/add-document', async (req, res) => {
    try {
        const { content } = req.body;
        const embeddingResponse = await embedModel.embedContent(content);
        const embedding = embeddingResponse.embedding.values;

        await supabase.from('documents').insert([{ content, embedding }]);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add document' });
    }
});

// Chat with retrieval
app.post('/chat', async (req, res) => {
    try {
        const { query } = req.body;
        const queryEmbedding = (await embedModel.embedContent(query)).embedding.values;

        const { data: matches } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_count: 3
        });

        const context = matches.map(m => m.content).join("\n");

        const result = await chatModel.generateContent([
            `You are a helpful real estate investing assistant.`,
            `Use this context to answer: ${context}`,
            `Question: ${query}`
        ]);

        res.json({ answer: result.response.text() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get answer' });
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));
