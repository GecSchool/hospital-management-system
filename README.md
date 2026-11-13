# 병원 진료 예약 및 환자 관리 시스템

## 프로젝트 소개

병원의 환자 정보와 진료 예약, 접수 현황, 진료 기록을 하나의 시스템에서 관리하기 위한 데이터베이스 응용 프로젝트입니다. 전화나 방문으로 요청받은 예약과 현장 접수부터 환자 호출, 진료 및 간호 기록까지의 업무 흐름을 웹 애플리케이션으로 연결하는 것을 목표로 합니다.

병원 직원, 의사, 간호사, 시스템 관리자는 각자의 업무에 맞는 기능을 이용합니다. 현재 화면 디자인과 업무 흐름을 바탕으로 개발을 준비하고 있으며, API 명세와 데이터 모델을 구체화할 예정입니다.

## 예정 기술 스택

- 프론트엔드: React, TypeScript
- 백엔드: Node.js, Express, TypeScript
- 데이터베이스: PostgreSQL

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

업무별 API 설명은 [API 명세 초안](docs/api-spec.md), 공통으로 구현할 업무 로직은 [백엔드 공통 구현 가이드](docs/backend-shared-logic.md)를 참고하세요.

## 데이터베이스 모델

Prisma 스키마와 초기 PostgreSQL 마이그레이션은 `backend/prisma/`에 있습니다. 설정과 제약조건, 아직 구현이 필요한 사항은 [데이터베이스 모델 가이드](docs/database-model.md)를 참고하세요.

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

도메인별 라우터·컨트롤러·서비스를 `backend/src/modules/`에 두고, 업무 라우터는 `backend/src/routes/index.ts`에 등록합니다. 환경 설정·Prisma 생성은 `src/config/`, 공통 오류·응답·미들웨어·도구는 `src/common/`에 둡니다. 구조와 의존 관계는 [백엔드 아키텍처](docs/backend-architecture.md)를 참고하세요.

Prisma 클라이언트 생성 위치는 `backend/src/generated/prisma/`이며 Git에 포함하지 않습니다. 클론하거나 스키마를 변경한 뒤 `npm run prisma:generate --workspace backend`를 먼저 실행해야 빌드 및 Prisma를 사용하는 테스트를 실행할 수 있습니다. 인증 연결점은 실제 세션에 아직 연결되지 않았고 테스트용 인증 우회는 등록되어 있지 않습니다. 업무 API를 추가할 때 팀원의 세션 구현과 매 요청 최신 계정 상태·역할·소속을 확인하는 제공자를 연결하고, 리소스별 접근 범위를 별도로 검증해야 합니다.

관리자 계정 목록·상세 조회 로직은 구현되어 있지만, 실제 인증 기능이 연결되기 전까지 실행 중인 서버에서는 접근을 `401`로 차단합니다. 테스트는 가상 인증 제공자를 사용하고 Prisma 조회를 격리된 테스트 DB로 대체합니다.

현재 명세는 업무 규칙과 화면을 토대로 작성한 **초안**입니다. Swagger UI에 표시되는 업무 API가 구현되었다는 뜻은 아닙니다. 구현되지 않은 API는 문서의 요청 실행 기능으로 호출할 수 없습니다. 세션 쿠키 이름, CSRF 설정, 일부 응답 필드와 미결 업무 정책은 구현 전에 팀에서 확정해야 합니다.

## 디렉터리 구성

- `frontend/`: React와 TypeScript를 사용하는 웹 화면
- `backend/`: Express와 TypeScript를 사용하는 API 서버

## 개발 현황

프로젝트 초기 준비 단계입니다. DB 스키마와 마이그레이션을 작성했으며, 실제 업무 API와 주민등록번호 보호 처리 등은 아직 구현하지 않았습니다.

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
