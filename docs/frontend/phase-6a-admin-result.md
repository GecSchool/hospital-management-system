# Phase 6A — 관리자 대시보드 및 계정 관리 결과

작업일: 2026-11-12. 브랜치: `feat/frontend`. Phase 6A의 프론트 UI·API adapter·개발용 Mock을 구현했다. 실제 백엔드 연동과 브라우저 시각 검증은 완료하지 않았다. commit / push / merge 및 Phase 6B 진행은 하지 않았다.

작업 전 실제 Vitest 278개가 통과했다. 기존 사용자 미커밋 변경을 보존했으며, 직전 취소된 Doctor UI 작업은 다시 적용하지 않았다. 시작 시 로컬 `docs/`가 없었으므로 현재 결과 문서만 생성했다.

## 구현 화면과 동작

| 화면 / 동작                            | 결과                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 관리자 대시보드 `/admin`               | STAFF·DOCTOR·NURSE·ADMIN의 ACTIVE 계정, ACTIVE/INACTIVE 진료과를 중앙 원본에서 집계. 대기 초대 제외. 로딩·오류·재시도·0건 표시                  |
| 계정 목록 `/admin/accounts`            | 이름·이메일 부분 일치, 역할·상태 정확 일치, AND 검색. 필터 검색 시 첫 페이지, 4행 페이지 탐색, 빈 결과·오류                                     |
| 계정 상세 `/admin/accounts/:accountId` | 이름·이메일·역할·소속·상태. 404, 닫기·목록 복귀, 상태 변경·재설정 연결. accountId와 doctorId 구분                                               |
| 계정 초대                              | 입력·검증·확인·pending·중복 제출 차단·실패 재시도·성공 안내. 의사·간호사 활성 진료과 필수. 직원·관리자 소속 필드 및 요청값 생략. 닫기 후 초기화 |
| 활성/비활성                            | 확인 후 변경, 성공 시 관련 조회 무효화. 마지막 활성 관리자 및 의사 미완료 업무를 서비스에서 거부. 실패 시 상태 유지                             |
| 재설정 요청                            | 확인·pending·중복 제출 차단·실패/성공 안내. ACTIVE/INACTIVE 모두 허용, 계정 활성화 없음. 기존 Phase 2 링크 확인·확정 화면 재사용                |

ADMIN 외 역할은 ProtectedRoute와 Mock 서비스 모두 차단한다. 관리자에게 환자·진료·간호 기록 본문을 추가 노출하지 않았다. 진료과·의료진 메뉴는 기존 플레이스홀더로 이동하며 Phase 6B 업무는 구현하지 않았다.

## 실제 Figma 및 Prototype 적용

Screens `32:2`의 metadata를 실제 조회하고 `32:4`, `32:66`, `34:249`, `37:3381`의 design context와 포함된 스크린샷을 확인했다. 상태 Frame `193:30332`, `193:30355`, `193:30309`, `193:30537`도 같은 방식으로 확인했다.

공통 sidebar 240px, 본문 시작 x=288, PageHeader 1104×100, 계정 테이블 1016px/행 56px, 초대 모달 560px/radius 12px, 상세 패널 420×828px 및 약 32px padding을 반영했다. 기존 Noto Sans KR·심벌 84×36·디자인 토큰을 재사용했다. 공유 헤더와 로고 +20px 여백은 보존했다. 하드코딩한 Figma 예시 사용자·통계는 사용하지 않았다.

Prototype 페이지 `193:243`에서 현재 관리자 섹션을 찾고 대표 17개 Frame의 실제 reactions 92개를 읽었다. 아래 연결은 버튼 존재만으로 추정하지 않았다.

| 실제 Prototype 연결                                 | 구현 대응                                 |
| --------------------------------------------------- | ----------------------------------------- |
| `193:30215` → `193:30265`                           | 대시보드 바로가기·메뉴 → 계정 목록        |
| `193:30265` → `193:30378`, `193:30401`, `237:13667` | 계정 선택 → 해당 상세 패널                |
| `193:30265` → `193:30286` → `193:30537`             | 초대 입력 → 요청 → 목록의 성공 안내       |
| `193:30378` → `193:30309` → `193:30378`             | 의사 비활성화 제한 → 확인 → 상세 복귀     |
| `193:30401` → `193:30332` → `193:30424`             | 비활성화 확인 → 상태 변경 후 목록         |
| `193:30468` → `193:30491` → `193:30265`             | 비활성 계정 활성화 확인 → 목록            |
| `193:30378` → `193:30355` → `193:30378`             | 재설정 확인 → 상세 결과 안내              |
| `193:30468` → `193:30514` → `193:30468`             | 비활성 계정 재설정 → 비활성 유지          |
| `237:13667` → `237:13688` → `237:13667`             | 마지막 활성 관리자 제한 → 상세 복귀       |
| `237:13749` → `193:378`                             | 본인 비활성화 확정 → 로그인               |
| `239:26294` → `239:26315`                           | 다른 관리자 비활성화 → 목록               |
| `193:30265` → `292:21916`, `292:21942`              | 역할·상태 선택. 기존 native Select 재사용 |

Prototype의 시각적 모달 상태 연결은 `NODE / NAVIGATE`였다. React에서는 기존 native dialog를 사용한다. 초대 발송 직전 확인 단계는 사용자 요구에 따라 추가했고, 실제 발송처럼 보이는 원본 성공 문구는 Mock 설명으로 바꿨다. Figma에 없는 서버 오류·빈 상태는 기존 공통 컴포넌트 및 OpenAPI를 기준으로 구현했다. 픽셀 단위 일치는 주장하지 않는다.

## Mock·인증·캐시 연결

- 기존 4개 역할 fixture를 `identity.ts`로 옮기고 기존 import 호환 export를 유지했다. 로그인과 관리자 기능이 `accounts.ts`의 하나의 Map을 사용한다. admin / staff / nurse / doctor와 비밀번호 1234는 유지했다.
- 별도 관리자 환자·예약·접수·Visit·진료과 저장소를 만들지 않았다. 기존 예약 저장소의 진료과 및 예약, 접수 저장소의 접수·Visit 상태를 참조한다. 현재 원본은 활성 과 2개·비활성 0개이며 통계를 위해 가상 진료과를 추가하지 않았다.
- 초대 요청은 메모리의 일회용 Mock 링크 상태만 만들고 계정을 생성하지 않는다. 로그인 화면의 기존 개발용 링크 시나리오에서 ‘최근 관리자 Mock 요청’으로 기존 가입 화면을 열어 수락할 때 가상 계정이 추가된다. 새 비밀번호는 저장하지 않으며 신규 계정의 실제 자격 증명 로그인은 백엔드 연동 대상이다.
- 재설정 요청은 상태를 바꾸지 않는다. 기존 재설정 확인·확정 화면에서 가상 링크를 소비하며 비활성 계정을 활성화하지 않는다. 실제 메일·실제 계정·서버 비밀번호 변경은 없다.
- 마지막 활성 관리자 차단과 오늘을 포함한 미래 미접수 유효 예약, 날짜에 관계없는 미완료 접수·진료 차단을 Mock 서비스에 적용했다. 과거 미접수 예약과 취소 예약만 있는 경우 허용한다. 기존 업무 데이터·작성자·담당 관계는 수정하지 않는다.
- 비활성화는 계정 세션 세대를 폐기한다. AuthProvider의 현재 사용자 무효화 구독 및 Mock `/me` 재확인으로 로그아웃·캐시 삭제를 연결했다. 재활성화해도 폐기된 세션이 부활하지 않는다.
- 관리자 Query는 `queryKeys.resource(accountId, 'admin')` 아래에 둔다. 상태 변경 후 목록·상세·대시보드를 무효화하고 로그아웃·전환·정지 시 전체 Query cache를 비운다. 이전 세대 요청의 늦은 성공 UI/캐시 갱신을 차단한다.
- 검색 텍스트는 메모리, 페이지 번호는 URL에 둔다. Query key·MutationCache·브라우저 저장소·로그에 비밀번호나 링크 토큰을 저장하지 않는다.
- 개발 전용 정상·느린 응답·조회 오류·저장 오류 시나리오를 재사용한다. 기본 API 모드, 운영 Mock 차단, 새로고침 초기화 정책을 유지한다. Mock은 서버 트랜잭션·동시성 보장의 대체가 아니다.

## 변경 파일

새 파일:

- `frontend/src/features/admin/AdminWorkspace.tsx`
- `frontend/src/features/admin/AdminDashboardPage.tsx`
- `frontend/src/features/admin/AdminAccountsPage.tsx`
- `frontend/src/features/admin/AdminDialogs.tsx`
- `frontend/src/features/admin/service.ts`
- `frontend/src/features/admin/admin.css`
- `frontend/src/features/admin/admin-service.test.ts`
- `frontend/src/features/admin/admin-ui.test.tsx`
- `frontend/src/services/mock/identity.ts`
- `frontend/src/services/mock/accounts.ts`
- `frontend/src/services/mock/admin.ts`
- `docs/frontend/architecture.md`
- `docs/frontend/api-map.md`
- `docs/frontend/figma-inventory.md`
- `docs/frontend/roadmap.md`
- `docs/frontend/phase-6a-admin-result.md`

기존 파일 최소 연결 변경:

- `frontend/src/app/router/routes.tsx` — ADMIN 자식 라우트 연결
- `frontend/src/features/auth/AuthProvider.tsx` — 현재 계정 무효화 구독
- `frontend/src/features/auth/authService.ts` — 선택적 무효화 구독 계약
- `frontend/src/services/mock/auth.ts` — 공통 계정 상태·세션 세대·기존 링크 화면 연결
- `frontend/src/features/staff/staffService.ts` — 관리자 서비스 facade 계약
- `frontend/src/features/staff/apiStaffService.ts` — 실제 관리자 adapter 연결
- `frontend/src/services/mock/staff.ts` — 기존 업무 저장소를 참조하는 관리자 facade
- `frontend/src/services/mock/appointments.ts` — 기존 진료과 원본의 읽기 참조 공개

기존 STAFF/NURSE/DOCTOR/AUTH 화면 컴포넌트·CSS 및 기존 테스트 파일은 수정하지 않았다. AuthProvider와 Mock 인증의 변경은 계정 상태·세션 연결에 한정한다. 작업 전 파일 해시와 비교하여 backend/OpenAPI 및 다른 업무 UI 보존을 확인했다. 패키지·루트 workspace 변경 없음.

## 검증

최종 실행 결과는 아래 표에 기록한다. UI 테스트는 jsdom 상호작용 검증이며 Chrome 렌더링 검증을 뜻하지 않는다.

| 검사                       | 결과                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기존 전체 Vitest           | 작업 전 278/278 통과 확인                                                                                                                                                                       |
| 전체 Vitest 최종           | 326/326 통과: 기존 278 + 신규 관리자 48, 21개 테스트 파일                                                                                                                                       |
| 관리자 서비스              | 30개: 집계·검색·AND·페이지·404·역할별 초대·수락 전 미생성·일회용 수락·오류·마지막 관리자·동시 정지·미래/과거 예약·미완료 접수/Visit·취소/기록 보존·세션 폐기·비활성 로그인·재설정·권한·API 계약 |
| 관리자 UI                  | 18개: 대시보드·이동·검색·페이지 초기화·패널 닫기·404·상태/통계 캐시 갱신·제한 안내·본인 로그아웃·초대 검증/재시도/중복 제출/초기화·비활성 재설정·로딩 오류 재시도·0건·권한·계정 전환 캐시       |
| TypeScript                 | `npm run typecheck --workspace frontend` 통과                                                                                                                                                   |
| Prettier                   | `prettier --single-quote --check frontend/src frontend/AGENTS.md docs/frontend` 통과                                                                                                            |
| 운영 빌드                  | `npm run build --workspace frontend` 통과                                                                                                                                                       |
| 운영 Mock 제외             | 빌드 JS에서 신규 Mock 토큰/계정/중앙 가상 사용자 식별자 미포함 확인. 기존 운영 모드 차단 테스트 유지                                                                                            |
| 업무 회귀                  | 기존 직원·간호사·의사·인증 테스트 통과, 기존 테스트 삭제·무시 없음                                                                                                                              |
| Chrome / 393px / 실제 픽셀 | 미검증. 사용자 지시대로 자동 브라우저 조작·개발 서버 실행 생략                                                                                                                                  |

## 실제 연동과 다음 범위

현재 서버 구현은 health와 OpenAPI 문서만 제공한다. DASH_03, ACC_01~05, DEP_01의 실제 서버 권한·상태·응답, 쿠키 세션 폐기, 의사 업무/마지막 관리자 동시성 보호, SMTP 수락·실패, 링크 발급·만료·일회성 소비, 비밀번호 저장·변경 및 초대 수락 계정의 실제 로그인은 Phase 7 통합 검증 대상이다. 세션 쿠키·CSRF 정책을 임의로 바꾸지 않았다.

Phase 6B의 진료과 생성·수정·삭제·활성 변경·의료진 소속 관리는 미구현이다. 기존 구조를 유지했으므로 6B에 착수할 수 있으나 이번 작업에서는 시작하지 않는다. 시각적 정밀 보정과 실제 렌더링 비교는 Phase 6D에 남긴다.
