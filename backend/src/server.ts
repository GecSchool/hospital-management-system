import { app } from './app.js';
const port = 3000;

app.listen(port, () => {
  console.log(`API 서버: http://localhost:${port}`);
});
