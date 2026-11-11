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

현재 명세는 업무 규칙과 화면을 토대로 작성한 **초안**입니다. Swagger UI에 표시되는 업무 API가 구현되었다는 뜻은 아닙니다. 구현되지 않은 API는 문서의 요청 실행 기능으로 호출할 수 없습니다. 세션 쿠키 이름, CSRF 설정, 일부 응답 필드와 미결 업무 정책은 구현 전에 팀에서 확정해야 합니다.

## 디렉터리 구성

- `frontend/`: React와 TypeScript를 사용하는 웹 화면
- `backend/`: Express와 TypeScript를 사용하는 API 서버

## 개발 현황

프로젝트 초기 준비 단계입니다. PostgreSQL 연동과 실제 업무 기능은 API 명세 및 데이터 모델을 정리한 뒤 구현할 예정입니다.

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
