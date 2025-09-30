const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: 'sk-0d9c33d52621a1036ee1a31933830176f5612e99f3026424' });
const elevenApiKey = 'sk-0d9c33d52621a1036ee1a31933830176f5612e99f3026424'; // koristi isti jer je ElevenLabs key

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
          'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL',
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
