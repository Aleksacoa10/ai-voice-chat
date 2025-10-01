require('dotenv').config();

const express = require('express');
const http = require('http');
const fs = require('fs');
const axios = require('axios');
const { Server } = require('ws');

const elevenApiKey = process.env.ELEVEN_API_KEY;
const voiceId = process.env.ELEVEN_VOICE_ID;

const app = express();
app.use(express.static('.')); // omogućava preuzimanje fajlova kao test.mp3

const server = http.createServer(app);
const wss = new Server({ server });

server.listen(process.env.PORT || 10000, () => {
  console.log("🟢 WebSocket test server je pokrenut");
});

wss.on('connection', (ws) => {
  ws.on('message', async () => {
    const botText = "Ovo je test poruka preko ElevenLabs.";
    console.log("🧪 Testiram ElevenLabs sa porukom:", botText);

    try {
      const ttsResp = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}`,
        {
          text: botText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.4, similarity_boost: 0.8 }
        },
        {
          headers: {
            'xi-api-key': process.env.ELEVEN_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      fs.writeFileSync("test.mp3", ttsResp.data);
      console.log("✅ test.mp3 uspešno snimljen!");

      ws.send("https://ai-voice-chat-apiv.onrender.com/test.mp3");
    } catch (err) {
      console.error("❌ TTS greška:", err.response?.status, err.response?.data || err.message);
      ws.send("Greška prilikom snimanja.");
    }
  });
});
