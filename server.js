require('dotenv').config();
const express = require('express');

const app = express();

// 🔥 CORS (obavezno za planiraj.me)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.text({ type: ['application/sdp', 'text/plain'] }));

app.get('/', (req, res) => {
  res.send('✅ Session server radi');
});

app.post('/session', async (req, res) => {
  try {
    console.log("🔥 /session HIT");

    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ NEMA API KEY");
      return res.status(500).send("Missing OPENAI_API_KEY");
    }

    if (!req.body) {
      console.error("❌ NEMA SDP BODY");
      return res.status(400).send("Missing SDP");
    }

    console.log("📦 SDP length:", req.body.length);

    const fd = new FormData();

    fd.set('sdp', req.body);
    fd.set('session', JSON.stringify({
      type: 'realtime',
      model: 'gpt-realtime',
      audio: {
        output: {
          voice: 'marin'
        }
      }
    }));

    console.log("📡 Šaljem ka OpenAI...");

    const r = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: fd
    });

    const text = await r.text();

    console.log("📥 OpenAI status:", r.status);

    if (!r.ok) {
      console.error("❌ OpenAI ERROR:", text);
      return res.status(r.status).send(text);
    }

    console.log("✅ SDP OK");

    res.status(200).send(text);

  } catch (e) {
    console.error("💥 SERVER ERROR:", e);
    res.status(500).send('Realtime session error');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🟢 Session server running on ${PORT}`);
});
