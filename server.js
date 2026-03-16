require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('ws');
const OpenAI = require('openai');
const { toFile } = require('openai');
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

  return String(text || '').replace(/[А-Яа-яЉЊЂЋЏљњђћџ]/g, ch => map[ch] || ch);
}

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PHP_CHATBOT_URL = process.env.PHP_CHATBOT_URL || 'https://planiraj.me/api/chatbot_gpt.php';

app.get('/', (req, res) => {
  res.send('✅ WebSocket server radi.');
});

wss.on('connection', (ws, req) => {
  console.log('🔌 Klijent povezan');
  console.log('REQ URL:', req.url);

  const url = new URL(req.url, 'http://localhost');
  const phpSessionId = url.searchParams.get('php_session_id') || '';
  console.log('PHP SESSION ID:', phpSessionId);

  let audioBuffers = [];
  let isProcessing = false;

  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) {
        const chunk = Buffer.from(data);
        if (chunk.length > 0) {
          audioBuffers.push(chunk);
        }
        return;
      }

      let msg = null;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        msg = null;
      }

      if (msg?.type !== 'end') return;
      if (isProcessing) return;

      isProcessing = true;

      if (!audioBuffers.length) {
        isProcessing = false;
        return;
      }

      const raw = Buffer.concat(audioBuffers);
      audioBuffers = [];

      console.log('TOTAL AUDIO SIZE:', raw.length);

      let transcriptText = '';

      try {
        console.log('TRANSCRIPTION START');

        const transcript = await openai.audio.transcriptions.create({
          file: await toFile(raw, 'audio.webm'),
          model: 'gpt-4o-transcribe',
          language: 'sr'
        });

        transcriptText = cyrToLat((transcript.text || '').trim());
        console.log('TRANSCRIPT TEXT:', transcriptText);
      } catch (err) {
        console.error('❌ Greška transkripcije FULL:', err);
        ws.send(JSON.stringify({
          type: 'reply',
          text: 'Nisam vas dobro razumeo. Možete ponoviti?'
        }));
        isProcessing = false;
        return;
      }

      if (!transcriptText) {
        ws.send(JSON.stringify({
          type: 'reply',
          text: 'Nisam vas dobro razumeo. Možete ponoviti?'
        }));
        isProcessing = false;
        return;
      }

      ws.send(JSON.stringify({
        type: 'transcript',
        text: transcriptText
      }));

      let phpData = {};

      try {
        console.log('CALLING PHP:', PHP_CHATBOT_URL);

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
        console.log('PHP DATA:', phpData);
      } catch (err) {
        console.error('❌ Greška chatbot_gpt.php FULL:', err.response?.data || err.message || err);
        ws.send(JSON.stringify({
          type: 'reply',
          text: 'Greška pri obradi zahteva.'
        }));
        isProcessing = false;
        return;
      }

      const reply = String(phpData.reply || 'Došlo je do greške.').trim();
      console.log('🤖 PHP reply:', reply);

      ws.send(JSON.stringify({
        type: 'reply',
        text: reply,
        options: Array.isArray(phpData.options) ? phpData.options : [],
        slots: Array.isArray(phpData.slots) ? phpData.slots : [],
        date: phpData.date || ''
      }));

      try {
        console.log('TTS START:', reply);

        const speech = await openai.audio.speech.create({
          model: 'gpt-4o-mini-tts',
          voice: 'nova',
          input: reply,
          format: 'mp3'
        });

        const audioBuffer = Buffer.from(await speech.arrayBuffer());
        console.log('SENDING AUDIO BACK:', audioBuffer.length);

        ws.send(audioBuffer, { binary: true });
      } catch (err) {
        console.error('❌ Greška TTS FULL:', err);
      }

      isProcessing = false;
    } catch (err) {
      console.error('❌ WS greška FULL:', err);
      ws.send(JSON.stringify({
        type: 'reply',
        text: 'Greška pri glasovnoj komunikaciji.'
      }));
      isProcessing = false;
    }
  });

  ws.on('close', () => {
    console.log('🔌 Klijent se diskonektovao');
    audioBuffers = [];
    isProcessing = false;
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🟢 WebSocket server pokrenut na portu ${PORT}`);
});
