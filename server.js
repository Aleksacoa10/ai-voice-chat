require('dotenv').config();

const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const express = require('express');
const http = require('http');
const { Server } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

server.listen(process.env.PORT || 10000, () => {
  console.log("🟢 WebSocket server je pokrenut (OpenAI TTS)");
});

wss.on('connection', (ws) => {
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      const audioPath = './temp_input.webm';
      fs.writeFileSync(audioPath, Buffer.concat(buffer));

      try {
        // 1. 🎤 Whisper STT (pretvori glas u tekst)
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', 'whisper-1');

        const whisperResp = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              ...formData.getHeaders(),
            }
          }
        );

        const userText = whisperResp.data.text;
        console.log("🎤 Korisnik rekao:", userText);

        // 2. 💬 GPT odgovor
        const chat = await openai.chat.completions.create({
          messages: [{ role: 'user', content: userText }],
          model: 'gpt-4',
        });

        const botText = chat.choices[0].message.content;
        console.log("🤖 Bot odgovorio:", botText);

        // 3. 🔊 OpenAI TTS (pretvori tekst u glas)
        const ttsResp = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",   // OpenAI TTS model
          voice: "alloy",             // biraš glas: alloy, verse, nova...
          input: botText,
        });

        const audioBuffer = Buffer.from(await ttsResp.arrayBuffer());

        // Pošalji binarni audio klijentu
        ws.send(audioBuffer);

      } catch (err) {
        console.error("❌ Greška:", err.response?.data || err.message);
        ws.send("Greška u obradi.");
      }

      buffer = [];
      fs.unlinkSync(audioPath); // očisti fajl
    } else {
      buffer.push(data);
    }
  });
});
