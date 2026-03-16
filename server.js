require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('ws');
const { OpenAI } = require('openai');
const axios = require('axios');

function cyrToLat(text) {
  const map = {
    А:'A', а:'a', Б:'B', б:'b', В:'V', в:'v', Г:'G', г:'g',
    Д:'D', д:'d', Ђ:'Đ', ђ:'đ', Е:'E', е:'e', Ж:'Ž', ж:'ž',
    З:'Z', з:'z', И:'I', и:'i', Ј:'J', ј:'j', К:'K', к:'k',
    Л:'L', л:'l', Љ:'Lj', љ:'lj', М:'M', м:'m', Н:'N', н:'n',
    Њ:'Nj', њ:'nj', О:'O', о:'o', П:'P', п:'p', Р:'R', р:'r',
    С:'S', с:'s', Т:'T', т:'t', Ћ:'Ć', ћ:'ć', У:'U', у:'u',
    Ф:'F', ф:'f', Х:'H', х:'h', Ц:'C', ц:'c', Ч:'Č', ч:'č',
    Џ:'Dž', џ:'dž', Ш:'Š', ш:'š'
  };
  return text.replace(/[А-Яа-яЉЊЂЋЏљњђћџ]/g, ch => map[ch] || ch);
}

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PHP_CHATBOT_URL = process.env.PHP_CHATBOT_URL || 'https://planiraj.me/api/chatbot_gpt.php';

app.get('/', (req, res) => {
  res.send('✅ WebSocket server radi.');
});

wss.on('connection', (ws, req) => {

  const url = new URL(req.url, 'http://localhost');
  const phpSessionId = url.searchParams.get('php_session_id') || '';

  let audioBuffers = [];

  ws.on('message', async (data, isBinary) => {

    try {

      if (isBinary) {
        audioBuffers.push(Buffer.from(data));
        return;
      }

      let msg = null;
      try {
        msg = JSON.parse(data.toString());
      } catch {}

      if (msg?.type !== 'end') return;

      if (!audioBuffers.length) return;

      const raw = Buffer.concat(audioBuffers);
      audioBuffers = [];

      const filename = path.join(os.tmpdir(), `audio-${Date.now()}.webm`);
      fs.writeFileSync(filename, raw);

      let transcriptText = '';

      try {

        const transcript = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filename),
          model: 'gpt-4o-transcribe',
          language: 'sr'
        });

        transcriptText = cyrToLat((transcript.text || '').trim());

      } catch (err) {

        ws.send(JSON.stringify({
          type: 'reply',
          text: 'Nisam vas dobro razumeo. Možete ponoviti?'
        }));

        fs.existsSync(filename) && fs.unlinkSync(filename);
        return;
      }

      fs.existsSync(filename) && fs.unlinkSync(filename);

      if (!transcriptText) {

        ws.send(JSON.stringify({
          type: 'reply',
          text: 'Nisam vas dobro razumeo. Možete ponoviti?'
        }));

        return;
      }

      ws.send(JSON.stringify({
        type: 'transcript',
        text: transcriptText
      }));

      let phpData = {};

      try {

        const phpRes = await axios.post(
          PHP_CHATBOT_URL,
          { message: transcriptText },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(phpSessionId ? { Cookie: `PHPSESSID=${phpSessionId}` } : {})
            },
            timeout: 40000
          }
        );

        phpData = phpRes.data || {};

      } catch (err) {

        ws.send(JSON.stringify({
          type: 'reply',
          text: 'Greška pri obradi zahteva.'
        }));

        return;
      }

      const reply = String(phpData.reply || 'Došlo je do greške.').trim();

      ws.send(JSON.stringify({
        type: 'reply',
        text: reply,
        options: Array.isArray(phpData.options) ? phpData.options : [],
        slots: Array.isArray(phpData.slots) ? phpData.slots : []
      }));

      /* GOOGLE TTS */

      try {

        const googleKey = "AIzaSyCXTDFto66p2z0GGxA1YfHDkyslslDdoSU";
console.log("GOOGLE TTS REQUEST:", reply);
        const googleRes = await axios.post(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`,
          {
            input: { text: reply },
     voice: {
  languageCode: "sr-RS",
  name: "sr-RS-Wavenet-A"
},
            audioConfig: {
              audioEncoding: "MP3",
              speakingRate: 1
            }
          }
        );

        const audioBuffer = Buffer.from(
          googleRes.data.audioContent,
          "base64"
        );

        ws.send(audioBuffer, { binary: true });

      } catch (err) {

        console.log("❌ Google TTS ERROR:", err.response?.data || err);

      }

    } catch (err) {

      ws.send(JSON.stringify({
        type: 'reply',
        text: 'Greška pri glasovnoj komunikaciji.'
      }));

    }

  });

  ws.on('close', () => {
    audioBuffers = [];
  });

});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🟢 WebSocket server pokrenut na portu ${PORT}`);
});
