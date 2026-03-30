const countiesData = require('../counties_KIs.json');
// ✅ node-fetch fallback for Node < 18
const fetch = globalThis.fetch || require('node-fetch');


module.exports = async function handler(req, res) {

console.log("=== API HIT ===");
console.log("Method:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ✅ FIX 1: Read 'message' (not 'prompt') to match what frontend sends
  const { message, system, imageBase64, fileMime, history = [] } = req.body;
  console.log("Incoming message:", message);
  console.log("Has image:", !!imageBase64);
  console.log("History length:", history.length);

  const apiKey = process.env.GROQ_API_KEY;
  console.log("API Key exists:", apiKey ? "YES" : "NO");
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GROQ_API_KEY" });
  }

  if (!message && !imageBase64) {
    return res.status(400).json({ error: "No message or image provided" });
  }

  try {
    // ✅ FIX 2: Build user content — support both text and image (multimodal)
    let userContent;

    if (imageBase64) {
      // Send image directly to vision model
      userContent = [
        {
          type: "image_url",
          image_url: {
            url: `data:${fileMime || "image/jpeg"};base64,${imageBase64}`
          }
        },
        {
          type: "text",
          text: message || "Analyze this real estate document. Perform a full SOP-based validity check and extract all key fields."
        }
      ];
    } else {
      userContent = message;
    }

    // ✅ FIX 3: Build messages array with conversation history
    const messages = [
      { 
        role: "system", 
        // This combines your instructions with the actual JSON data
        content: system + "\n\nDATABASE RULES:\n" + JSON.stringify(countiesData) 
      },
      ...history,
      { 
        role: "user", 
        content: imageBase64 ? userContent : message 
      }
    ];

    // ✅ FIX 4: Use llama3-8b-8192 model via Groq
    const model = "llama3-8b-8192";

    console.log("Using model:", model);
    console.log("Message length:", typeof userContent === "string" ? userContent.length : "multimodal");
    
    console.log("Sending request to Groq...");
    console.log("Model:", model);
    console.log("Messages preview:", JSON.stringify(messages).slice(0, 300));

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.1   // Low temp for consistent, rule-based answers
      })
    });

    const data = await response.json();

    console.log("Groq status:", response.status);
    console.log("Groq full response:", JSON.stringify(data));

    if (!response.ok) {
      console.error("Groq error:", data);
      return res.status(500).json({
        error: data.error?.message || `Groq error: ${response.status}`
      });
    }

    const resultText = data.choices?.[0]?.message?.content;

    if (!resultText) {
      console.error("Empty response from AI:", data);
      return res.status(500).json({ error: "No response from AI model" });
    }

    res.status(200).json({ reply: resultText });

  } catch (err) {
  console.error("❌ FULL ERROR:", err);
  res.status(500).json({ error: "AI connection failed: " + err.message });
  }
};
