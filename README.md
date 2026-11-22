# 병원 진료 예약 및 환자 관리 시스템

## 프로젝트 소개

병원의 환자 정보, 진료 예약, 접수 현황, 진료·간호 기록을 관리하는 데이터베이스 응용 프로젝트입니다. 전화나 방문으로 요청받은 예약과 현장 접수부터 환자 호출, 입실 확인, 진료 완료까지의 업무 흐름을 웹 애플리케이션으로 연결합니다.

병원 직원, 의사, 간호사, 시스템 관리자는 각자의 업무에 맞는 화면과 API를 이용합니다.

## 기술 스택

- 프론트엔드: React, TypeScript
- 백엔드: Node.js, Express, TypeScript
- 데이터베이스: PostgreSQL, Prisma
- 세션 및 일회성 링크: Redis
- 초대·재설정 메일: SMTP

## 개발 환경

Node.js 22.13 이상 또는 24 이상과 npm이 필요합니다. `.nvmrc`에는 팀 개발을 위한 Node.js 버전이 지정되어 있습니다. 저장소 루트에서 의존성을 설치합니다.

```bash
npm install
```

서로 다른 터미널에서 프론트엔드와 백엔드를 실행합니다.

```bash
npm run dev:frontend  # http://localhost:5173
npm run dev:backend   # http://localhost:3000
```

개발 중 프론트엔드의 `/api` 요청은 백엔드로 전달됩니다. 서버 상태는 `/api/health`에서 확인할 수 있습니다. 루트에서 `npm run build`를 실행하면 두 프로젝트의 타입을 검사하고 빌드합니다.

## API 명세

백엔드 서버를 실행한 뒤 [Swagger UI](http://localhost:3000/api-docs/)에서 API 목록과 요청·응답 스키마를 확인할 수 있습니다. 명세 원본은 `backend/openapi.yaml`이며, 서버에서도 `/api-docs/openapi.yaml`로 제공합니다.

업무별 요청·응답과 권한은 [API 명세](docs/api-spec.md), 공통 업무 규칙은 [백엔드 공통 구현 가이드](docs/backend-shared-logic.md)를 참고하세요.

## 데이터베이스 모델

Prisma 스키마와 PostgreSQL 마이그레이션은 `backend/prisma/`에 있습니다. 테이블, 제약조건, 인덱스, 예약 일정 검증 트리거는 [데이터베이스 모델 가이드](docs/database-model.md)를 참고하세요.

개발용 DB를 준비하고 `backend/.env.example`을 참고해 `backend/.env`에 `DATABASE_URL`을 설정한 뒤 저장소 루트에서 실행합니다.

```bash
npm run prisma:generate --workspace backend
npm run db:deploy --workspace backend
```

새 스키마 변경은 `npm run db:migrate --workspace backend -- --name 변경명`으로 마이그레이션을 생성하고 SQL을 검토해 버전 관리합니다. 기존 공유·운영 DB에 적용하기 전에는 데이터와 마이그레이션 이력을 먼저 확인하세요.

## 백엔드 테스트

단위 테스트는 `npm run test:unit --workspace backend`로 실행합니다. HTTP 및 DB 통합 테스트는 `npm run test:integration --workspace backend`로 실행합니다. 전체 테스트는 `npm test --workspace backend`입니다. HTTP 테스트는 로컬 소켓을 열 수 있어야 합니다.

도메인과 공통 코드의 테스트는 대상 파일 옆에 `*.unit.test.ts` 또는 `*.integration.test.ts`로 둡니다. 여러 도메인을 가로지르는 테스트와 공통 테스트 데이터는 `backend/tests/`에 두며, `backend/scripts/`의 단위 테스트도 같은 명명 규칙을 따릅니다. 두 Vitest 설정은 이 이름으로 실행 대상을 분리하고, TypeScript 배포 빌드에서는 테스트 파일을 제외합니다.

DB 통합 테스트는 기존 개발 DB와 별도의 로컬 PostgreSQL 데이터베이스 `hospital_management_test`가 필요합니다. 직접 DB를 생성하고 `backend/.env.test.example`을 참고해 Git에 포함되지 않는 `backend/.env.test`에 `TEST_DATABASE_URL`을 설정합니다. `npm run db:test:deploy --workspace backend`로 해당 테스트 DB에 마이그레이션을 적용한 뒤 통합 테스트를 실행합니다. 이 명령은 URL이 로컬 `hospital_management_test`가 아니거나 개발 DB와 같으면 중단합니다. 기존 데이터가 있는 DB에 적용하지 마세요. DB가 없거나 연결에 실패하면 통합 테스트는 생략하지 않고 실패합니다.

## 백엔드 공통 구조

`backend/src/modules/`에서 도메인별로 먼저 나누고, 도메인 안은 `routes/`, `controllers/`, `services/`, `validations/`로 구분합니다. 업무 라우터는 `backend/src/routes/index.ts`에서 연결합니다. 환경 설정·Prisma 생성은 `src/config/`, 공통 오류·응답·미들웨어·도구는 `src/common/`에 둡니다. 구조와 담당 API는 [백엔드 아키텍처](docs/backend-architecture.md)를 참고하세요.

Prisma 클라이언트 생성 위치는 `backend/src/generated/prisma/`이며 Git에 포함하지 않습니다. 클론하거나 스키마를 변경한 뒤 `npm run prisma:generate --workspace backend`를 먼저 실행해야 빌드 및 Prisma를 사용하는 테스트를 실행할 수 있습니다.

## 인증과 계정 준비

로그인은 서버 세션과 `HttpOnly` 쿠키를 사용합니다. 세션에는 계정 ID, 로그인 시각, 세션 무효화 번호를 보관합니다. 서버는 보호된 요청마다 계정의 상태·역할·소속을 DB에서 확인합니다. 세션 만료, 링크 유효 시간, 실패 횟수 제한은 [인증 설계](docs/auth-design.md)를 참고하세요.

세션과 초대·비밀번호 재설정 링크는 Redis에, 메일은 SMTP 서버로 보냅니다. `backend/.env.example`의 인증 항목을 참고해 `backend/.env`에 설정합니다. 로컬 개발에서 `REDIS_URL`과 `SMTP_HOST`를 비워 두면 Redis 대신 서버 메모리를 쓰고, 메일은 보내지 않고 서버 콘솔에 링크를 출력합니다. 운영 환경(`NODE_ENV=production`)에서는 필요한 값이 빠지면 서버가 시작되지 않습니다.

계정은 관리자의 초대로만 만들어지므로 첫 관리자는 명령으로 만듭니다. 비밀번호는 실행 중에 입력합니다.

```bash
npm run admin:create --workspace backend -- admin@example.com 관리자이름
```

로컬 개발·시연용 가상 계정(관리자·직원·의사·간호사)과 진료과가 필요하면 다음 명령을 사용합니다. 만들어진 계정의 비밀번호는 실행 결과에 표시됩니다.

```bash
npm run db:seed:dev --workspace backend
```

`src/app.ts`가 내보내는 기본 `app`은 인증을 연결하지 않은 앱이라 보호된 요청을 모두 `401`로 거부합니다. 실제 서버는 `src/server.ts`에서 세션·저장소·메일을 연결해 앱을 만듭니다. 업무 API 테스트는 가상 인증 제공자를 넘기고, 인증 테스트는 메모리 저장소와 가짜 메일 발송을 연결합니다.

## 디렉터리 구성

- `frontend/`: React와 TypeScript를 사용하는 웹 화면
- `backend/`: Express와 TypeScript를 사용하는 API 서버

## 개발 현황

역할별 웹 화면과 OpenAPI에 정의된 업무 API 58개가 구현되어 있습니다.

- **직원**은 환자를 등록·조회·수정하고, 진료 예약과 당일 접수를 관리합니다.
- **의사**는 진료 일정·가능 시간·휴진을 관리하고, 진료 이력 조회, 진료 완료·기록 정정, 재진 예약을 처리합니다.
- **간호사**는 본인 진료과의 예약을 등록하고, 접수 환자의 호출·입실 확인과 간호 기록 작성·정정을 담당합니다.
- **관리자**는 계정 초대·활성 상태·비밀번호 재설정 요청과 진료과·의료진 소속을 관리합니다.

주민등록번호는 AES-256-GCM 암호문으로 저장하고 HMAC 조회값으로 중복을 검사합니다. 직원 상세 화면에는 마스킹된 번호를 표시하며, 환자 등록 후 번호 변경은 서버에서 제한합니다.

## 커밋 컨벤션

커밋 메시지는 `타입(범위): 변경 내용` 형식으로 작성합니다. 범위는 필요할 때 `frontend`, `backend` 등으로 표시하며 생략할 수 있습니다.

- `feat`: 기능 추가
- `fix`: 오류 수정
- `refactor`: 기능 변경 없는 코드 구조 개선
- `docs`: 문서 작성 및 수정
- `style`: 코드 형식 정리
- `test`: 테스트 추가 및 수정
- `chore`: 환경 설정, 패키지 등 기타 작업

예: `feat(frontend): 환자 목록 화면 추가`, `fix(backend): 예약 중복 확인 오류 수정`
