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
  console.log("🟢 WebSocket server je pokrenut (OpenAI TTS, srpski)");
});

wss.on('connection', (ws) => {
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      const audioPath = './temp_input.webm';
      fs.writeFileSync(audioPath, Buffer.concat(buffer));

      try {
        // 1. 🎤 Whisper STT (prepoznaje srpski automatski)
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

        // 2. 💬 GPT odgovor na srpskom
        const chat = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: "system", content: "Odgovaraj isključivo na srpskom jeziku." },
            { role: 'user', content: userText }
          ],
        });

        const botText = chat.choices[0].message.content;
        console.log("🤖 Bot odgovorio:", botText);

        // 3. 🔊 OpenAI TTS
        const ttsResp = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "alloy",   // alloy, verse, nova, sage
          input: botText,
        });

        // Pretvori u buffer
        const audioBuffer = Buffer.from(await ttsResp.arrayBuffer());

        // Opcija 1: Snimi fajl i šalji URL (browser-friendly)
        const outPath = "./public/response.mp3";
        fs.writeFileSync(outPath, audioBuffer);
        ws.send(JSON.stringify({ audioUrl: "/response.mp3", text: botText }));

        // Opcija 2 (ako hoćeš raw audio kroz WS): ws.send(audioBuffer);

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

