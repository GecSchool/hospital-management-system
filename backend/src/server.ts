import { app } from './app.js';
import { config } from './config/env.js';

app.listen(config.port, () => {
  console.log(`API 서버: http://localhost:${config.port}`);
});
