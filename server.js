require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { OpenAI } = require('openai');
const express = require('express');
const expressWs = require('express-ws');

const app = express();
expressWs(app); // enable WebSocket
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.ws('/voicechat', (ws) => {
  console.log("🔌 WS konekcija otvorena");
  let buffer = [];

  ws.on('message', async (data) => {
    if (data.toString() === 'END') {
      try {
        const userText = await getLatestMessageFromPHP();
        if (!userText) {
          ws.send("Greška: prazna poruka.");
          return;
        }

        console.log("🎤 Korisnik rekao:", userText);

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
    } else {
      buffer.push(data);
    }
  });
});

async function getLatestMessageFromPHP() {
  try {
    const res = await axios.get("https://planiraj.me/api/get_latest_message.php");
    return res.data.message;
  } catch (err) {
    console.error("❌ Greška u fetch-u iz PHP-a:", err.message);
    return null;
  }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ WS server pokrenut na portu ${PORT}`);
});
