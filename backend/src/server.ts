import { createApp } from './app.js';
import { parseAuthConfig } from './config/auth.js';
import { config } from './config/env.js';
import { createAuthRuntime } from './modules/auth/auth-runtime.js';
import { loadResidentNumberProtector } from './modules/patient/services/resident-number.js';

// 개인정보 보호 키가 유효하지 않으면 서버를 시작하지 않는다.
loadResidentNumberProtector();
// 세션 저장소(Redis)와 메일 발송을 연결한다. 운영 환경에서 설정이 빠지면 여기서 중단된다.
const auth = await createAuthRuntime(parseAuthConfig(process.env));
const app = createApp(config, { auth });
app.listen(config.port, () => {
  console.log(`API 서버: http://localhost:${config.port}`);
});
