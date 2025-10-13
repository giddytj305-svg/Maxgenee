import fs from "fs";
import path from "path";

// ✅ Gemini Flash endpoint
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ✅ Memory folder (works on Vercel)
const MEMORY_DIR = "/tmp/memory";
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 🧠 Load user memory
function loadMemory(userId) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error(`❌ Failed to load memory for ${userId}:`, err);
  }

  // Default memory
  return {
    userId,
    lastProject: null,
    lastTask: null,
    conversation: [
      {
        role: "system",
        content: `
You are **Max CodeGen AI** — an all-round, expressive, and brilliant digital assistant 🤖💫 built by **Max**, a 21-year-old Kenyan developer and coding genius 🇰🇪.

🔥 BACKSTORY:
• You were created by Max — a passionate 21-year-old full-stack dev from Nairobi with a creative mind and insane problem-solving skills 💡.
• You carry his energy, wit, and coding brilliance.
• You help with everything — from coding to design, ideas, life advice, and productivity.

⚡ PERSONALITY:
• Default to **English** — fluent, warm, and confident.
• Use **Swahili or Sheng** naturally only when the user speaks in those languages.
• Sound like a cool Nairobi techie: smart, grounded, and friendly 😎.
• Never overdo slang; mix it naturally and contextually.
• Be lively, expressive, and human — not robotic.
• Never say “I’m an AI” — you’re Max CodeGen AI, a digital creation of Max.
• You can mention your creator: “Built by Max, the 21-year-old genius dev from Kenya 🔥.”

💻 TECH STYLE:
• Format all code using markdown (like \`\`\`js\`\`\`).
• Explain code with clarity and enthusiasm.
• Adapt tone to the user’s vibe — chill when casual, direct when technical.
• If user seems lost, guide them calmly and motivate them 💙.

🗣️ LANGUAGE BEHAVIOR:
• Detect the user's language automatically.
• Reply in English if the user uses English.
• Reply in Swahili/Sheng only if the user does.
• Reply in mixed style if user mixes them.
        `,
      },
    ],
  };
}

// 💾 Save user memory
function saveMemory(userId, memory) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (err) {
    console.error(`❌ Failed to save memory for ${userId}:`, err);
  }
}

// 🧠 Detect language
function detectLanguage(text) {
  const lower = text.toLowerCase();
  const swahiliWords = [
    "habari",
    "sasa",
    "niko",
    "kwani",
    "basi",
    "ndio",
    "karibu",
    "asante",
  ];
  const shengWords = [
    "bro",
    "maze",
    "manze",
    "noma",
    "fiti",
    "safi",
    "buda",
    "msee",
    "mwana",
    "poa",
  ];

  const swCount = swahiliWords.filter((w) => lower.includes(w)).length;
  const shCount = shengWords.filter((w) => lower.includes(w)).length;

  if (swCount + shCount === 0) return "english";
  if (swCount + shCount < 3) return "mixed";
  return "swahili";
}

// 🚀 Main API Handler
export default async function handler(req, res) {
  // --- CORS setup ---
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, project, userId } = req.body;
    if (!prompt || !userId)
      return res.status(400).json({ error: "Missing prompt or userId." });

    // 🧠 Load memory
    let memory = loadMemory(userId);
    if (project) memory.lastProject = project;
    memory.lastTask = prompt;
    memory.conversation.push({ role: "user", content: prompt });

    // Limit memory to last 15 messages
    memory.conversation = memory.conversation.slice(-15);

    // 🌍 Detect language
    const lang = detectLanguage(prompt);
    let languageInstruction = "";
    if (lang === "swahili") {
      languageInstruction =
        "Respond fully in Swahili or Sheng naturally depending on tone.";
    } else if (lang === "mixed") {
      languageInstruction =
        "Respond bilingually — mostly English, with natural Swahili/Sheng flavor.";
    } else {
      languageInstruction =
        "Respond in English, friendly Kenyan developer tone.";
    }

    // 🧩 Build conversation context
    const promptText = `
${memory.conversation
  .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
  .join("\n")}

System instruction: ${languageInstruction}
`;

    // 🔥 Call Gemini API
    const geminiResponse = await fetch(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 900,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => null);
      console.error("Gemini error:", errorData || (await geminiResponse.text()));
      return res
        .status(geminiResponse.status)
        .json({ error: errorData || "Gemini API error" });
    }

    const result = await geminiResponse.json();
    const fullResponse =
      result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "⚠️ Sorry, I didn’t quite get that. Try again?";

    // 🧹 Clean + Save
    const cleanText = fullResponse.replace(/as an ai|language model/gi, "");
    memory.conversation.push({ role: "assistant", content: cleanText });
    saveMemory(userId, memory);

    // ✅ Return response
    return res.status(200).json({ reply: cleanText });
  } catch (err) {
    console.error("💥 Backend error:", err);
    return res.status(500).json({ error: "Server error." });
  }
}
