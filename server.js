require('dotenv').config();
const express = require('express');

const app = express();

app.use(express.text({ type: ['application/sdp', 'text/plain'] }));

app.post('/session', async (req, res) => {
  try {
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

    const r = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: fd
    });

    const sdp = await r.text();
    res.status(r.status).send(sdp);
  } catch (e) {
    console.error(e);
    res.status(500).send('Realtime session error');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Session server running on ${PORT}`);
});
