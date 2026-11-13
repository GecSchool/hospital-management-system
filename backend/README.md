# 백엔드 개발

서버 실행과 데이터베이스 준비는 저장소 루트 README를 참고한다.

## 주민등록번호 보호 키

서버 실행 전에 `backend/.env`에 `RESIDENT_ENCRYPTION_KEY`와 `RESIDENT_LOOKUP_KEY`를 설정한다. 각각 서로 다른 무작위 32바이트를 64자리 16진수로 지정하며 누락·오류·동일 키일 때 서버는 시작하지 않는다. 각각 독립적으로 `openssl rand -hex 32`를 실행해 개발용 키를 만들 수 있다. 실제 키는 Git이나 DB에 넣지 않는다.

암호문은 AES-256-GCM 버전 1, 12바이트 임의 IV, 16바이트 인증 태그와 암호문으로 구성된다. 동일 번호의 중복 검사는 정규화된 번호의 HMAC-SHA-256 값을 사용한다. 현재 암호화 키는 하나만 읽으므로 기존 데이터가 있다면 키를 임의로 변경하지 않는다. 조회 키도 변경하면 중복 검사가 깨지므로 재암호화·조회값 재계산 및 전환 도구를 먼저 마련해야 한다. 현재는 실제 개인정보가 아닌 가상 데이터만 사용한다.

## 코드 포맷

Prettier 설정은 이 `backend/`에만 적용한다. 루트에서 다음 명령을 실행한다.

```bash
npm run format --workspace backend
npm run format:check --workspace backend
```

생성된 Prisma 클라이언트, 마이그레이션 SQL, OpenAPI YAML, 빌드 산출물은 자동 포맷 대상에서 제외한다. 프론트엔드 파일은 변경하지 않는다.

## 테스트

```bash
npm run test:unit --workspace backend
npm run test:integration --workspace backend
```

통합 테스트는 분리된 테스트 DB가 필요하다. 각 계정·의료진 테스트는 독립 트랜잭션에서 가상 데이터를 생성하고 종료 시 롤백한다. 테스트 DB의 생성과 마이그레이션은 루트 README의 백엔드 테스트 안내를 따른다.
