import express from 'express';

const app = express();
const port = 3000;

app.use(express.json());
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`API 서버: http://localhost:${port}`);
});
