require('dotenv').config();
const { OpenAI } = require('openai');
const express = require('express');
const expressWs = require('express-ws');

const app = express();
expressWs(app);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.ws('/voicechat', (ws) => {
  console.log("🔌 WS konekcija otvorena");
  let userText = '';

  ws.on('message', async (data) => {
    if (data.toString().startsWith('TEXT:')) {
      userText = data.toString().substring(5); // korisnička poruka

      console.log("🎤 Korisnik rekao:", userText);

      try {
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
    }
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ WS server pokrenut na portu ${PORT}`);
});
