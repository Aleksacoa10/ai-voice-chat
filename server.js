require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('ws');
const { OpenAI } = require('openai');
const { toFile } = require('openai/uploads');
const axios = require('axios');

function cyrToLat(text) {
  const map = {
    А:'A', а:'a', Б:'B', б:'b', В:'V', в:'v', Г:'G', г:'g',
    Д:'D', д:'d', Ђ:'Đ', ђ:'đ', Е:'E', е:'e', Ж:'Ž', ж:'ž',
    З:'Z', з:'z', И:'I', и:'i', Ј:'J', ј:'j', К:'K', к:'k',
    Л:'L', л:'l', Љ:'Lj', љ:'lj', М:'M', м:'m', Н:'N', н:'n',
    Њ:'Nj', њ:'nj', О:'O', о:'o', П:'P', п:'p', Р:'R', р:'r',
    С:'S', с:'s', Т:'T', т:'t', Ћ:'Ć', ћ:'ć', У:'U', у:'u',
    Ф:'F', ф:'f', Х:'H', х:'h', Ц:'C', ц:'c', Ч:'Č', č:'č',
    Џ:'Dž', џ:'dž', Ш:'Š', ш:'š'
  };
  return text.replace(/[А-Яа-яЉЊЂЋЏљњђћџ]/g, ch => map[ch] || ch);
}

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PHP_CHATBOT_URL =
  process.env.PHP_CHATBOT_URL ||
  "https://planiraj.me/api/chatbot_gpt.php";

app.get("/", (req, res) => {
  res.send("✅ WebSocket server radi.");
});

wss.on("connection", (ws, req) => {
  console.log("🔌 Klijent povezan");

  const url = new URL(req.url, "http://localhost");
  const phpSessionId = url.searchParams.get("php_session_id") || "";

  let audioBuffers = [];

  ws.on("message", async (data, isBinary) => {
    try {

      if (isBinary) {
        audioBuffers.push(Buffer.from(data));
        return;
      }

      let msg = null;
      try {
        msg = JSON.parse(data.toString());
      } catch {}

      if (msg?.type !== "end") return;

      if (!audioBuffers.length) return;

      const raw = Buffer.concat(audioBuffers);
      audioBuffers = [];

      let transcriptText = "";

      try {

        console.log("🎤 TRANSCRIPTION START");

        const transcript = await openai.audio.transcriptions.create({
          file: await toFile(raw, "audio.webm"),
          model: "gpt-4o-transcribe",
          language: "sr"
        });

        transcriptText = cyrToLat((transcript.text || "").trim());

      } catch (err) {
        console.error("❌ Transcription error:", err);

        ws.send(JSON.stringify({
          type: "reply",
          text: "Nisam vas dobro razumeo. Možete ponoviti?"
        }));

        return;
      }

      if (!transcriptText) {
        ws.send(JSON.stringify({
          type: "reply",
          text: "Nisam vas dobro razumeo. Možete ponoviti?"
        }));
        return;
      }

      console.log("🎤 Korisnik rekao:", transcriptText);

      ws.send(JSON.stringify({
        type: "transcript",
        text: transcriptText
      }));

      let phpData = {};

      try {

        const phpRes = await axios.post(
          PHP_CHATBOT_URL,
          { message: transcriptText },
          {
            headers: {
              "Content-Type": "application/json",
              ...(phpSessionId
                ? { Cookie: `PHPSESSID=${phpSessionId}` }
                : {})
            },
            timeout: 40000
          }
        );

        phpData = phpRes.data || {};

      } catch (err) {

        console.error("❌ PHP error:", err.response?.data || err.message);

        ws.send(JSON.stringify({
          type: "reply",
          text: "Greška pri obradi zahteva."
        }));

        return;
      }

      const reply = String(phpData.reply || "Došlo je do greške.").trim();

      console.log("🤖 PHP reply:", reply);

      const speechPromise = openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "nova",
        input: reply,
        format: "wav"
      });

 const responsePayload = {
  type: "reply",
  text: reply,
  options: Array.isArray(phpData.options) ? phpData.options : [],
  slots: Array.isArray(phpData.slots) ? phpData.slots : [],
  date: phpData.date || "",
  selected_date: phpData.selected_date || phpData.date || "",
  date_prompt: !!phpData.date_prompt,
  booking_done: reply.includes("uspešno je poslat zahtev za rezervaciju")
};

ws.send(JSON.stringify(responsePayload));
      try {

        console.log("🔊 TTS START");

        const speech = await speechPromise;

        const audioBuffer = Buffer.from(await speech.arrayBuffer());

        ws.send(audioBuffer, { binary: true });

      } catch (err) {
        console.error("❌ TTS error:", err);
      }

    } catch (err) {

      console.error("❌ WS error:", err);

      ws.send(JSON.stringify({
        type: "reply",
        text: "Greška pri glasovnoj komunikaciji."
      }));
    }
  });

  ws.on("close", () => {
    console.log("🔌 Klijent se diskonektovao");
    audioBuffers = [];
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🟢 WebSocket server pokrenut na portu ${PORT}`);
});
