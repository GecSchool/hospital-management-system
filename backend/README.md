# 백엔드 개발

서버 실행과 데이터베이스 준비는 저장소 루트 README를 참고한다.

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
