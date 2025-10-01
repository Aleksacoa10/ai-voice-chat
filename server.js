

const express = require('express');
const http = require('http');
const fs = require('fs');
const axios = require('axios');
const { Server } = require('ws');

const elevenApiKey = '3de84d40128b24bd3aa593c311a3dd3f29b5ebc83ff6e77437b166dca339df41';
const voiceId = 'EXAVITQu4vr4xnSDxMaL';


const app = express();

// 🚩 SERVE PUBLIC FOLDER (ovo je bitno!)
app.use(express.static('public'));

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
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: botText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.4, similarity_boost: 0.8 }
        },
        {
          headers: {
            'xi-api-key': elevenApiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      // 🚩 SNIMI U PUBLIC FOLDER
      fs.writeFileSync("public/test.mp3", ttsResp.data);
      console.log("✅ test.mp3 uspešno snimljen!");

      // 🚩 POŠALJI LINK KLIJENTU
      ws.send("https://ai-voice-chat-apiv.onrender.com/test.mp3");
    } catch (err) {
      console.error("❌ TTS greška:", err.response?.status, err.response?.data || err.message);
      ws.send("Greška prilikom snimanja.");
    }
  });
});
