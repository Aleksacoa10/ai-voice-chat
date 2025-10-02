require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const express = require('express');
const http = require('http');
const { Server } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔗 Učitaj kontekst iz PHP API-ja
async function getContextFromPHP() {
  try {
    const res = await axios.get("https://planiraj.me/api/get_latest_message.php");
    return res.data.message || '';
  } catch (err) {
    console.error("❌ Greška u fetch-u iz PHP-a:", err.message);
    return '';
  }
}

server.listen(process.env.PORT || 10000, () => {
  console.log("🟢 WS server pokrenut (Whisper + TTS + get_latest_message.php)");
});

wss.on('connection', (ws) => {
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      const audioPath = './temp_input.webm';
      fs.writeFileSync(audioPath, Buffer.concat(buffer));
      buffer = [];

      try {
        // 🔈 Whisper transkripcija
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', 'whisper-1');
        formData.append('language', 'sr');

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

        const contextText = await getContextFromPHP();

        const chat = await openai.chat.completions.create({
          messages: [
            { role: 'system', content: contextText },
            { role: 'user', content: userText }
          ],
          model: 'gpt-4o'
        });

        const botText = chat.choices[0].message.content;
        console.log("🤖 Bot odgovorio:", botText);

        const ttsResp = await openai.audio.speech.create({
          model: "tts-1",
          voice: "onyx",
          input: botText
        });

        const audioBuffer = Buffer.from(await ttsResp.arrayBuffer());
        ws.send(audioBuffer);
      } catch (err) {
        console.error("❌ Greška:", err);
        ws.send("Greška u obradi.");
      }

      fs.unlinkSync(audioPath);
    } else {
      buffer.push(data);
    }
  });
});
