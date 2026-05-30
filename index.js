require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

// ✅ Handle both export styles of pdf-parse
const pdfParse = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: "10MB" }));
app.use(cors());

const groq = new Groq({ apiKey: process.env.APIKEY });

app.get("/", (req, res) => {
  res.send("Backend Working");
});

app.post("/send", async (req, res) => {
  try {
    let { jd, base64 } = req.body;

    if (!jd || !base64) {
      return res.status(400).json({ message: "Missing Data" });
    }

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const buffer = Buffer.from(base64, "base64");

    const pdfData = await pdfParse(buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({ message: "Could not extract text from PDF" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are an ATS resume analyzer. Respond with ONLY valid JSON. No markdown, no code fences, no extra text."
        },
        {
          role: "user",
          content: `Compare this Resume and Job Description.

Resume:
${resumeText}

Job Description:
${jd}

Return ONLY this JSON with no other text:
{
  "score": 75,
  "reason": "explanation here",
  "missing_keywords": ["keyword1"],
  "matched_keywords": ["keyword2"]
}

Rules:
- score is an integer 0-100, never a decimal
- return ONLY the JSON, nothing else`
        }
      ],
      temperature: 0.1
    });

    const aiResponse = completion.choices[0].message.content;
    const cleaned = aiResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.score === "number") {
      parsed.score = parsed.score <= 1
        ? Math.round(parsed.score * 100)
        : Math.round(parsed.score);
    }

    res.status(200).json({ response: parsed });

  } catch (err) {
    console.error("BACKEND ERROR:", err);
    res.status(500).json({ message: "Server Error", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running at port", PORT);
});