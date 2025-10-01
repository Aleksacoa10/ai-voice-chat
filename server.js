require('dotenv').config();

const express = require('express');
const http = require('http');
const fs = require('fs');
const axios = require('axios');
const { Server } = require('ws');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new Server({ server });

server.listen(process.env.PORT || 10000, () => {
  console.log("🟢 WebSocket test server je pokrenut (OpenAI TTS)");
});

wss.on('connection', (ws) => {
  ws.on('message', async () => {
    const botText = "Ovo je test poruka preko OpenAI TTS.";
    console.log("🧪 Testiram OpenAI TTS sa porukom:", botText);

    try {
      const resp = await axios.post(
        "https://api.openai.com/v1/audio/speech",
        {
          model: "gpt-4o-mini-tts",
          voice: "alloy",  // možeš promeniti: alloy, verse, shimmer, coral
          input: botText
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          responseType: "arraybuffer"
        }
      );

      fs.writeFileSync("public/test.mp3", resp.data);
      console.log("✅ test.mp3 snimljen sa OpenAI TTS");

      ws.send("https://ai-voice-chat-apiv.onrender.com/test.mp3");
    } catch (err) {
      console.error("❌ Greška OpenAI TTS:", err.response?.status, err.response?.data || err.message);
      ws.send("Greška prilikom snimanja.");
    }
  });
});
