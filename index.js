const express = require("express");
const app = express();
app.use(express.json());

const GROQ_KEY = process.env.GROQ_KEY;

app.post("/ask", async (req, res) => {
    try {
        const { question, history } = req.body;

        if (!question || question.trim().length === 0) {
            return res.status(400).json({ error: "Question is required." });
        }

        // Build messages
        const messages = [
            {
                role: "system",
                content: `You are HustleBot, a friendly and knowledgeable Kenyan financial advisor 
                          built into the HustleScore app. Your expertise includes M-Pesa, M-Shwari, 
                          Fuliza, KCB M-Pesa, SACCOs, budgeting and saving strategies for Kenyan 
                          households, and the HustleScore system. Keep answers concise and practical. 
                          Use KES/KSh for currency. Be warm and encouraging. Respond in Swahili if 
                          the user writes in Swahili, otherwise English.`
            }
        ];

        if (Array.isArray(history)) {
            history.forEach((msg) => {
                messages.push({
                    role: msg.isUser ? "user" : "assistant",
                    content: msg.text,
                });
            });
        }
        messages.push({ role: "user", content: question.trim() });

        // Call Groq API
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_KEY}`,
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                max_tokens: 512,
                messages,
            }),
        });

        const result = await response.json();
        const reply = result.choices?.[0]?.message?.content
            ?? "Sorry, I couldn't generate a response.";
        res.json({ reply });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error. Please try again." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HustleBot server running on port ${PORT}`));
