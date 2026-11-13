import { app } from './app.js';
import { config } from './config/env.js';
import { loadResidentNumberProtector } from './modules/patient/services/resident-number.js';

// 개인정보 보호 키가 유효하지 않으면 서버를 시작하지 않는다.
loadResidentNumberProtector();
app.listen(config.port, () => {
  console.log(`API 서버: http://localhost:${config.port}`);
});
