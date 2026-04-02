const countiesData = require('../counties_rules.json');
// ✅ node-fetch fallback for Node < 18
const fetch = globalThis.fetch || require('node-fetch');

// ✅ Smart lookup: extract only the relevant county data to stay within token limits
function getRelevantContext(message) {
  if (!message) return { common_rules: countiesData.common_rules };

  const msgLower = message.toLowerCase();

  // Try to find a matching county by name in the message
  const matchedCounty = (countiesData.counties || []).find(c => {
    const countyName = c.county?.toLowerCase() || "";
    // e.g. "Assumption_LA KI_v1.2" → check if message contains "assumption"
    const parts = countyName.split(/[_\s]/);
    return parts.some(part => part.length > 3 && msgLower.includes(part));
  });

  if (matchedCounty) {
    return {
      common_rules: countiesData.common_rules,
      county: matchedCounty
    };
  }

  // No specific county matched — return only common_rules to save tokens
  return {
    common_rules: countiesData.common_rules,
    note: "No specific county matched. Apply common rules."
  };
}

module.exports = async function handler(req, res) {

  console.log("=== API HIT ===");
  console.log("Method:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ✅ Read 'message' to match what frontend sends
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
    // ✅ Build user content — support both text and image (multimodal)
    let userContent;

    if (imageBase64) {
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

    // ✅ Only inject relevant county rules — avoids blowing the TPM limit
    const relevantContext = getRelevantContext(message);
    console.log("County context matched:", relevantContext?.county?.county || "common rules only");

    // ✅ Build messages array with conversation history
    const messages = [
      {
        role: "system",
        content: system + "\n\nDATABASE RULES (relevant context only):\n" + JSON.stringify(relevantContext)
      },
      ...history,
      {
        role: "user",
        content: imageBase64 ? userContent : message
      }
    ];

    // ✅ Updated model — llama3-8b-8192 is decommissioned
    const model = "llama-3.3-70b-versatile";

    console.log("Using model:", model);
    console.log("Message length:", typeof userContent === "string" ? userContent.length : "multimodal");
    console.log("Sending request to Groq...");
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
