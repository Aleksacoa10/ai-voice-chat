require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const express = require('express');
const expressWs = require('express-ws');

const app = express();
expressWs(app);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.ws('/voicechat', (ws) => {
  console.log("🔌 WS konekcija otvorena");
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      const audioPath = './temp_input.webm';
      fs.writeFileSync(audioPath, Buffer.concat(buffer));
      buffer = [];

      try {
        // 🎙️ Whisper STT
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

        // 🔁 Uzimamo dodatni kontekst (PHP endpoint)
        const context = await getLatestMessageFromPHP();

        // 💬 Chat
        const chat = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `Odgovaraj vrlo kratko i jasno, isključivo na srpskom jeziku.
              Ako korisnik pita za uslugu ili zaposlenog, koristi sledeći kontekst:
              Usluge: ${context.services?.join(", ") || "nema"}
              Zaposleni: ${context.staff?.join(", ") || "nema"}`
            },
            { role: 'user', content: userText }
          ]
        });

        const botText = chat.choices[0].message.content;
        console.log("🤖 Bot odgovorio:", botText);

        // 🔊 TTS
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

      fs.unlinkSync(audioPath); // obriši temp fajl
    } else {
      buffer.push(data);
    }
  });
});

async function getLatestMessageFromPHP() {
  try {
    const res = await axios.get("https://planiraj.me/api/get_latest_message.php");
    return res.data; 
    // očekuje { message: "...", services: [...], staff: [...] }
  } catch (err) {
    console.error("❌ Greška u fetch-u iz PHP-a:", err.message);
    return { services: [], staff: [] };
  }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ WS server pokrenut na portu ${PORT}`);
});
