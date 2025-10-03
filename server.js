require('dotenv').config();
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('ws');
const { OpenAI } = require('openai');
const axios = require('axios');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.send("✅ WebSocket server radi.");
});

wss.on('connection', (ws) => {
  console.log('🔌 Klijent povezan');

  let buffer = [];
  let timeout;

  ws.on('message', async (data) => {
    buffer.push(data);
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const raw = Buffer.concat(buffer);
      const filename = `audio-${Date.now()}.webm`;
      fs.writeFileSync(filename, raw);

      const mp3file = filename.replace('.webm', '.mp3');
      exec(`ffmpeg -i ${filename} -ar 16000 -ac 1 ${mp3file}`, async (err) => {
        if (err) return ws.send('❌ Greška pri konverziji');

        const transcript = await openai.audio.transcriptions.create({
          file: fs.createReadStream(mp3file),
          model: 'whisper-1',
          language: 'sr'
        });

        const userText = transcript.text;
        console.log('🎤 Korisnik rekao:', userText);

        const contextRes = await axios.get('https://planiraj.me/api/get_context.php');

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'Ti si pametni asistent za zakazivanje termina.' },
            { role: 'user', content: `${userText}\n\nDostupni kontekst:\n${JSON.stringify(contextRes.data)}` }
          ]
        });

        const reply = completion.choices[0].message.content;
        console.log('🤖 GPT:', reply);

        const ttsRes = await axios.post('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + process.env.GOOGLE_API_KEY, {
          input: { text: reply },
          voice: { languageCode: 'sr-RS', name: 'sr-RS-Standard-A' },
          audioConfig: { audioEncoding: 'MP3' }
        });

        const audioBuffer = Buffer.from(ttsRes.data.audioContent, 'base64');
        ws.send(audioBuffer);

        fs.unlinkSync(filename);
        fs.unlinkSync(mp3file);
        buffer = [];
      });
    }, 800);
  });

  ws.on('close', () => {
    console.log('🔌 Klijent se diskonektovao');
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🟢 WebSocket server pokrenut na portu ${PORT}`);
});
