const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const elevenApiKey = process.env.ELEVEN_API_KEY;
console.log("🔑 Eleven API KEY:", elevenApiKey);

const express = require('express');
const http = require('http');
const { Server } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

server.listen(process.env.PORT || 10000, () => {
  console.log("🟢 WebSocket server je pokrenut");
});


wss.on('connection', (ws) => {
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      const audioPath = './temp_input.webm';
      fs.writeFileSync(audioPath, Buffer.concat(buffer));

      try {
        // 1. Whisper STT
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', 'whisper-1');

        const whisperResp = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${openai.apiKey}`,
              ...formData.getHeaders(),
            }
          }
        );

        const userText = whisperResp.data.text;
        console.log("🎤 Korisnik rekao:", userText);

        // 2. GPT-4 odgovor
        const chat = await openai.chat.completions.create({
          messages: [{ role: 'user', content: userText }],
          model: 'gpt-4'
        });

        const botText = chat.choices[0].message.content;
        console.log("🤖 Bot odgovorio:", botText);

        // 3. ElevenLabs TTS
const ttsResp = await axios.post(
  'https://api.elevenlabs.io/v1/text-to-speech/j9jfwdrw7BRfcR43Qohk',
  {
    text: 'Hello from ElevenLabs!',
    model_id: 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5
    }
  },
  {
    headers: {
      'xi-api-key': process.env.ELEVEN_API_KEY,
      'Content-Type': 'application/json'
    },
    responseType: 'arraybuffer'
  }
);


        ws.send(ttsResp.data); // pošalji glas
      } catch (err) {
        console.error("❌ Greška:", err);
        ws.send("Greška u obradi.");
      }

      buffer = [];
      fs.unlinkSync(audioPath); // obriši fajl
    } else {
      buffer.push(data);
    }
  });
});
