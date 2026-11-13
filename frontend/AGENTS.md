# 프론트엔드 개발 규칙

이 문서는 `frontend/`에 적용한다. 다음 작업은 `docs/frontend/architecture.md`, `figma-inventory.md`, `api-map.md`, `roadmap.md`를 함께 읽고 시작한다.

## 작업 범위와 저장소 보호

- 기존 React/Vite 프로젝트와 루트 npm Workspaces 구조를 유지한다. 새 프론트엔드 프로젝트나 불필요한 UI·상태 관리 라이브러리를 만들지 않는다.
- `backend/`와 `backend/openapi.yaml`은 읽기만 한다. 프론트 작업을 위해 서버·명세를 임의 수정하거나 실제 DB에 연결하지 않는다.
- 시작할 때 브랜치, `git status`, 원격 저장소를 확인한다. 작업 브랜치는 `feat/frontend`다. 다른 브랜치이거나 예상하지 못한 사용자 변경과 충돌하면 보고하고 구현을 중단한다. 사용자 변경을 덮어쓰거나 임의 삭제하지 않는다.
- Figma 원본을 변경하지 않는다. commit, push, merge 및 다음 Phase 실행은 별도의 사용자 요청 없이는 수행하지 않는다.

## 화면과 컴포넌트

- 상세 화면은 요청받은 범위만 구현한다. `features/<domain>/`에 업무 컴포넌트·hooks·서비스를 두고, 실제 재사용이 생기는 UI만 `components/ui`, 상태 표시는 `components/common`, 골격은 `components/layout`에 둔다.
- 기존 Button, Input, Select, FormField, Modal, Table, Badge, Tabs, Pagination과 PageHeader를 먼저 확인하고 재사용한다. API 요청을 공통 UI에 넣지 않는다.
- 스타일은 기존 CSS와 `styles/tokens.css`를 사용한다. 색상·서체·간격·곡률·테두리를 페이지마다 다시 정의하지 않는다. Figma에 없는 그림자·아이콘·상태 디자인을 임의 추가하지 않는다.
- 입력은 label·오류 설명과 연결하고, 버튼 type, 키보드 탐색, 포커스, 로딩·중복 제출 방지를 유지한다. Modal은 native dialog를 사용하며 footer의 취소 동작을 `onClose`에 연결한다.

## Figma 준수

- 목록의 node ID는 탐색 출발점이다. 구현 전 실제 `get_metadata`로 현재 계층을 확인하고 `get_design_context`로 필요한 대표 Frame·공통 컴포넌트 상세를 읽는다. `figma-design-to-code` 스킬을 적용한다.
- 대표 화면은 `get_screenshot` 또는 design context에 포함된 스크린샷으로 확인한다. 전체 Prototype 상태를 한꺼번에 상세 요청하지 않는다.
- 현재 Screens 페이지와 오래된 Components 변형의 메뉴가 다르면 실제 화면 및 Prototype 이동 관계를 확인하고 근거를 문서에 남긴다. 확인하지 않은 프로토타입 연결을 추측하지 않는다.
- 공식 심벌은 로컬 `assets/soongsil-symbol.png`의 형태·색상·비율과 84×36 표시 크기를 유지한다. 임시 Figma URL을 런타임에 사용하지 않는다. Noto Sans KR는 로컬 파일과 동봉 라이선스를 유지한다.
- 현재 업무 레이아웃은 데스크톱 기준 `min-width: 1024px`다. 모바일 디자인을 임의 창작하지 않는다.

## API·Mock·정보 보호

- 명세와 실제 backend route를 둘 다 확인한다. `api-map.md`의 operationId·권한·요청/응답을 기준으로 서비스 계약을 작성하고, 미확정 필드·엔드포인트를 추측하지 않는다.
- 기본 모드는 실제 API다. Mock은 개발 환경의 명시적 `VITE_API_MODE=mock` 선택에만 사용한다. API 오류를 Mock 성공으로 자동 대체하지 않는다. 운영 빌드의 Mock 차단을 유지한다.
- Axios client는 `services/api/client.ts`, 공통 오류는 `errors.ts`, 실제/Mock 교체는 기능별 서비스 경계를 사용한다. UI는 adapter 선택을 직접 수행하지 않는다.
- 인증은 세션 쿠키이며 최종 인증·역할·소속·담당 범위 검증은 백엔드 책임이다. 브라우저 라우트 제한을 서버 보안의 대체로 취급하지 않는다.
- 주민등록번호, 환자·진료·간호기록, 비밀번호, 초대·재설정 토큰 및 인증 정보를 localStorage/sessionStorage, 로그, URL, 영구 Query cache에 불필요하게 저장하지 않는다. Mock에는 합성 데이터만 사용한다.
- Query key는 `queryKeys.resource(accountId, resource)` 아래에 조회 조건을 붙인다. 계정 간 cache를 공유하지 않고 로그아웃·세션 만료·계정 전환 시 비운다. key에 민감한 본문·비밀번호·토큰을 넣지 않는다.
- 날짜 전용 `YYYY-MM-DD`와 시각 `HH:mm`은 명세의 `Asia/Seoul` 업무 값으로 다룬다. `new Date(dateOnly).toISOString()`으로 날짜를 바꾸지 않는다. 실제 timestamp는 명세의 `+09:00` 오프셋을 준수한다.
- 예약 중복·근무시간·휴진 충돌·호출/입실 경합의 최종 검증은 백엔드 책임이다. 조회된 슬롯만으로 저장 성공을 보장하지 않는다.
- 진료·간호기록은 원본과 정정 버전을 분리한다. 기존 기록을 덮어쓰지 않고 `baseVersionNo`, 정정 사유, `409 VERSION_CONFLICT`를 처리한다. 직원·관리자에게 기록 본문을 임의 노출하지 않는다.

## 검증과 인계

- 사용자 관점의 의미 있는 테스트를 작성한다. 권한 차단, 오류·충돌, 폼/탭/모달 동작, 서비스 계약을 검증하고 구현을 그대로 복제하는 테스트는 피한다.
- 저장소 루트에서 `npm run test --workspace frontend`, `npm run typecheck --workspace frontend`, `npm run build --workspace frontend`를 실행한다. 새 TSX 여러 개를 수정했다면 React best practices 체크리스트도 검토한다.
- 개발 서버를 실행해 해당 역할·라우트의 실제 렌더링과 Figma 대표 화면을 비교한다. 테스트하지 못한 서버 연동이나 브라우저 동작을 완료로 기록하지 않는다.
- 변경 파일, 실제 실행한 검증, 미확정 API·디자인 및 다음 작업을 문서에 남긴다. 사용자 요청 범위가 끝나면 중단한다.
