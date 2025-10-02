require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const express = require('express');
const http = require('http');
const { Server } = require('ws');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔽 MySQL konekcija
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// 🔽 Test konekcije odmah pri startu
(async () => {
  try {
    const [rows] = await db.query("SELECT 1");
    console.log("✅ Konekcija sa bazom uspešna");
  } catch (err) {
    console.error("❌ Neuspešna konekcija sa bazom:", err.message);
  }
})();

server.listen(process.env.PORT || 10000, () => {
  console.log("🟢 WebSocket server je pokrenut (OpenAI TTS)");
});

wss.on('connection', (ws) => {
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      const audioPath = './temp_input.webm';
      fs.writeFileSync(audioPath, Buffer.concat(buffer));
      buffer = [];

      try {
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

        // ❗ Primer SQL upita (npr. loguj poruku)
        await db.query("INSERT INTO logs (text) VALUES (?)", [userText]);

        const chat = await openai.chat.completions.create({
          messages: [{ role: 'user', content: userText }],
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
        console.error("❌ Greška:", err.response?.data || err.message);
        ws.send("Greška u obradi.");
      }

      fs.unlinkSync(audioPath);
    } else {
      buffer.push(data);
    }
  });
});
