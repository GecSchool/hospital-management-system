# Phase 6B — 관리자 진료과·의료진 관리 결과

2026-11-12, `feat/frontend`. Phase 6B의 프론트 화면·서비스·개발용 Mock·자동 테스트를 구현했다.

**이번 작업에서는 실제 백엔드 서버, 데이터베이스, OpenAPI를 수정하지 않았으며 프론트엔드와 개발용 Mock만 구현했다.** Figma 원본·패키지·루트 workspace도 변경하지 않았다. Git commit / push / merge 및 Phase 6C 자동 진행은 하지 않았다. 기존 사용자 미커밋 변경과 Phase 6A 파일을 보존했다.

## 화면과 동작

- `/admin/departments`: 좌측 진료과 목록, 전체/활성/비활성 필터 및 선택, 우측 선택 과 이름·상태·수정/상태/삭제 액션. 의료진 이름·이메일·역할·계정 상태·소속 변경, 의사/간호사 필터, 3행 페이지 탐색. 필터·선택 시 첫 페이지 복귀. 로딩·오류·재시도·빈 결과 처리.
- 등록·수정: 이름 필수 및 공백 검증, 기존 값 표시, 저장 전 확인, pending·중복 제출 방지·취소·성공·오류·재시도. `DEPARTMENT_NAME_DUPLICATE` 발생 시 목록과 초안 유지. ID 변경 없음.
- 상태 변경: 확인 모달 뒤 활성/비활성 변경. 소속 의료진이 한 명이라도 있으면 비활성 계정까지 포함하여 `DEPARTMENT_HAS_STAFF` 차단. 소속 강제 해제 없음.
- 삭제: 대상 과 확인 후 요청, 성공 시 목록 갱신·선택 복구. `DEPARTMENT_IN_USE` 시 원래 데이터·선택 유지. 연쇄 삭제 없음.
- 의료진 이동: 현재 과, 변경할 ACTIVE 과 선택 및 확인. 같은 과·비활성 과·직원/관리자 대상은 허용하지 않음. 미처리 업무가 있는 의사는 `DOCTOR_HAS_PENDING_WORK` 안내 후 선택 초안을 보존하여 폼으로 복귀.
- 관리자 메뉴·대시보드 바로가기에서 기존 경로를 재사용했다. 별도 상세 API·검색·정렬·새 업무 페이지를 추가하지 않았다.

## 실제 Figma와 Prototype

MCP 세션을 새로 만들고 관리자 `32:2`의 metadata를 실제 조회했다. 다음 design context에 포함된 스크린샷을 직접 확인했다.

| Frame       | 이름 / 적용                                                     |
| ----------- | --------------------------------------------------------------- |
| `32:138`    | 진료과·의료진 관리 / Default. 285px 좌측, 82px 간격, 737px 우측 |
| `37:2553`   | 진료과 등록. 560×340 이름 입력 모달                             |
| `37:2669`   | 의료진 소속 변경. 560×430 두 필드 모달                          |
| `193:31390` | 진료과 수정. 기존 이름 표시·저장·취소                           |
| `193:31689` | 진료과 삭제 확인. 520×270 확인 모달                             |
| `193:31476` | 비활성화 제한. 확인 후 목록 복귀                                |
| `193:31605` | 의사 소속 변경 제한. 확인 후 이동 폼 복귀                       |

Prototype 섹션 `193:31305`의 15개 Frame에서 실제 reactions 98개를 읽었다. 주요 연결:

| 실제 연결                                             | 구현                               |
| ----------------------------------------------------- | ---------------------------------- |
| `193:31306` → `193:31347` → `193:31306`               | 등록 열기·등록/취소·목록 복귀      |
| `193:31306` → `193:31390` → `193:31306`               | 수정·저장/취소                     |
| `193:31306` → `193:31648`                             | 다른 진료과 선택·해당 의료진 조회  |
| `193:31306` → `193:31476` → `193:31306`               | 의료진 잔존 비활성화 제한          |
| `193:31306` → `193:31519` → `193:31306`               | 참조 진료과 삭제 제한              |
| `193:31306` → `193:31433` → `193:31605` → `193:31433` | 소속 이동·의사 업무 제한·초안 복귀 |
| `193:31648` → `193:31689` → `193:31732`               | 삭제 가능 과의 삭제 확인·목록 반영 |
| `193:31648` → `193:31773` / 역방향                    | 빈 진료과 활성 상태 전환           |
| `193:31814`, `193:31857`                              | 비활성/활성 과 이름 수정 및 취소   |
| 각 Frame → `193:30215`, `193:30265`                   | 관리자 대시보드·계정 관리 메뉴     |

Prototype의 시각적 모달 이동은 NODE/NAVIGATE이며 React에서는 기존 native dialog로 구현했다. 생성·수정·이동 저장 전 별도 확인과 상태 변경 확인, 상태/역할 필터, 의료진 이메일·계정 상태는 사용자 요구와 API 계약에 따라 기존 UI 패턴으로 보완했다. 이 추가 요소가 원본 화면에 정확히 존재한다고 주장하지 않는다.

공통 Noto Sans KR, 색상·선·곡률 토큰, Button/Input/Select/FormField/Modal/Table/Pagination/PageHeader/AdminLayout을 재사용했다. 로고 84×36과 상단 +20px 여백은 그대로다. 새 CSS는 `.admin-workspace` 아래만 적용했다. Chrome 자동 조작·개발 서버·모바일 실제 렌더링·픽셀 검증은 사용자 지시대로 미실행이다.

## 서비스와 중앙 데이터 연동

DEP_01~08을 `DepartmentService`와 실제 Axios adapter에 연결했다. DEP_08의 실제 명세 경로는 요청서 예시와 다른 **`/medical-staff/{accountId}/department`**이므로 이를 사용했다. DELETE는 204 본문을 파싱하지 않는다. 번호형 목록만 PageMeta, 나머지는 `data/meta:null` 계약을 유지한다. 실제 서버 endpoint를 구현하지 않았고 API 실패를 Mock으로 대체하지 않는다.

- 진료과 원본은 기존 예약 factory의 배열, 의료진 원본은 기존 계정 Map이다. 별도 관리자 데이터 저장소나 새 Mock 프레임워크를 만들지 않았다.
- 기본 실행의 기존 예약 전용 의사 2개를 같은 계정 Map에 합성 계정으로 대응시켰다. 따라서 관리자 목록·통계는 이 계정들도 실제 Map에서 계산한다. 독립 의료진 배열을 만들지 않았다. 기존 예약 프로필의 이름·doctorId와 기존 4개 역할 로그인/1234는 보존했으며 추가 로그인 비밀번호는 만들지 않았다.
- 생성 과는 대시보드 및 초대·예약의 ACTIVE 선택에 반영된다. 비활성/삭제 과는 신규 선택에서 제외하고 저장 시 활성 여부·현재 의사 소속을 다시 확인한다.
- 의료진 이동은 계정·doctorId를 유지한다. 새 예약의 의사 선택은 현재 소속을 따르며 과거 예약·접수·Visit의 진료과/담당 의사는 snapshot으로 보존한다. 조회 시 같은 과 ID의 현재 이름을 표시한다. 원본 진료 기록/버전/본문은 덮어쓰지 않는다.
- 의사 이동과 계정 비활성화는 같은 미처리 업무 판정을 사용한다. 오늘 포함 미래 미접수 유효 예약, 날짜에 관계없는 미완료 접수·Visit은 차단한다. 과거 미접수·취소 예약만 있으면 이동을 허용한다.
- ADMIN 변경 권한 및 DEP_06 조회 권한을 Mock 서비스에서도 재검사한다. DEP_07은 STAFF/NURSE/ADMIN만 허용하고 NURSE는 본인 진료과로 제한한다. DEP_01의 공통 ACTIVE 조회를 유지한다. 실제 서버 권한은 미구현이다.
- 변경 성공 시 현재 계정의 업무 Query prefix를 취소·무효화하여 진료과·의료진·계정 상세·대시보드·초대 선택을 갱신한다. 실패 시 캐시 값을 낙관적으로 덮어쓰지 않는다. 로그인 중인 해당 의료진의 소속 변경은 Mock 구독으로 AuthProvider에 전달하여 이전 접근 범위의 개인 캐시와 오래된 요청 결과를 격리한다. 로그아웃/계정 전환 캐시 삭제도 유지한다.

## 삭제 정책의 미확정 범위

OpenAPI 상단 미결 정책 8번은 ‘의료진 외 예약·접수·진료 이력 중 삭제 제한에 포함할 참조 범위 미정’이라고 명시한다. 이번 Mock은 소속 계정(비활성 포함), 보유한 예약(취소 포함), 접수(삭제 표시 포함), Visit 참조가 있으면 삭제하지 않는 보수적 동작이다. 기록은 접수·Visit 관계를 통해 보존한다. 이를 확정된 서버 보존 정책·트랜잭션/동시성 보장이라고 주장하지 않는다. 정확한 서버 삭제 참조 범위는 추후 확정해야 한다.

## 검증 결과

| 항목                      | 결과                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 작업 전 실제 Vitest       | 기존 326/326 통과 확인                                                                                                                                                                     |
| 전체 최종 Vitest          | **363/363**, 23개 파일. 기존 326 + 신규 37                                                                                                                                                 |
| 신규 서비스               | 22개: 목록·상태·생성·중복·이름/역사 관계·상태/삭제 제한·역할/페이지·소속·비활성 대상·미처리 업무·완료/과거/취소 기록·오류·권한·재검사·예약/이동 경합·초대 수락 시 과 상태·정확한 HTTP 계약 |
| 신규 UI                   | 15개: 목록/빈 상태·생성/확인/검증·중복/오류/초안/중복 클릭·이름 변경·상태·삭제·제한 안내·역할/페이지·이동/계정 캐시·로그인 간호사 범위 갱신·조회 재시도·계정 전환 캐시·ADMIN 외 진입 차단  |
| TypeScript                | `npm run typecheck --workspace frontend` 통과                                                                                                                                              |
| Prettier                  | `prettier --single-quote --check frontend/src frontend/AGENTS.md docs/frontend` 통과                                                                                                       |
| 운영 빌드                 | `npm run build --workspace frontend` 통과                                                                                                                                                  |
| 운영 Mock 차단            | 기존 운영 모드 차단 테스트 유지. 생성된 JS의 중앙/진료과 Mock 식별자 포함 여부를 검사                                                                                                      |
| 기존 기능                 | 직원·간호사·의사·인증·6A 테스트 통과. 기존 테스트 삭제·skip·기대값 변경 없음                                                                                                               |
| 실제 브라우저·모바일·서버 | 미검증/미실행. jsdom 테스트를 실제 시각 검증으로 간주하지 않음                                                                                                                             |

UI 검증 중 진료과와 의료진 조회가 함께 실패했을 때, 진료과 재시도 후 의료진의 오류가 남는 문제를 발견했다. 의료진 Query가 성공한 진료과 조회에 의존하도록 수정하고 재시도 테스트로 확인했다.

운영 빌드 JS는 약 507.56kB(압축 149.26kB)로 500kB chunk 경고가 발생했다. 빌드는 성공했으며 경고 임계값을 올려 숨기지 않았다. 코드 분할은 예정된 Phase 6C/후속 성능 검토 대상으로 남기고 이번 범위에서 전면 리팩터링하지 않았다.

## 변경 파일

신규:

- `frontend/src/features/admin/DepartmentsPage.tsx`
- `frontend/src/features/admin/DepartmentDialog.tsx`
- `frontend/src/features/admin/departmentService.ts`
- `frontend/src/features/admin/departments.css`
- `frontend/src/features/admin/departments-service.test.ts`
- `frontend/src/features/admin/departments-ui.test.tsx`
- `frontend/src/services/mock/departments.ts`
- `docs/frontend/phase-6b-admin-result.md`

기존 연결·프로젝션 수정:

- `frontend/src/features/admin/AdminWorkspace.tsx`
- `frontend/src/features/staff/staffService.ts`
- `frontend/src/features/staff/apiStaffService.ts`
- `frontend/src/app/router/routes.tsx`
- `frontend/src/services/mock/accounts.ts`
- `frontend/src/services/mock/appointments.ts`
- `frontend/src/services/mock/receptions.ts`
- `frontend/src/services/mock/doctorSchedule.ts`
- `frontend/src/services/mock/clinical.ts`
- `frontend/src/services/mock/staff.ts`
- `frontend/src/services/mock/auth.ts`
- `frontend/src/features/auth/authService.ts`
- `frontend/src/features/auth/AuthProvider.tsx`
- `docs/frontend/roadmap.md`
- `docs/frontend/api-map.md`
- `docs/frontend/architecture.md`
- `docs/frontend/figma-inventory.md`

계정 메타데이터와 과거 업무의 이름/소속 참조를 연결하는 최소 서비스 변경이다. 기존 STAFF/NURSE/DOCTOR/AUTH 화면과 CSS, 공통 레이아웃·로고·디자인 토큰은 수정하지 않았다. 작업 시작 시 파일 해시와 비교하여 backend/OpenAPI 보존 및 파일 삭제 없음을 확인했다.

## 다음 단계와 미검증

Phase 6C 리팩터링에 착수할 수 있으나 이번에는 진행하지 않았다. 실제 삭제 참조 범위, 서버 세션/권한·동시성 보장, 실제 DB와 API 연동은 미확정·미구현이다. Phase 6D의 브라우저 UI 정밀 보정도 남아 있다. Phase 6B 프론트/개발 Mock만 완료하고 중단한다.
