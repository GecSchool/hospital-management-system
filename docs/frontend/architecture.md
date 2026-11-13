# 현재 프론트엔드 구조와 Phase 6A 연결

## Phase 6B 추가 연결

- `StaffService.departments(principal)`에 DEP_01~08 인터페이스와 실제 API adapter를 연결했다. 기존 `AdminWorkspace`에서 같은 principal·계정별 Query prefix·중복 제출/세션 세대 보호 hook을 재사용한다. 새 Mock 시스템이나 서버를 만들지 않았다.
- 진료과의 원본은 기존 예약 factory의 `departments` 배열이며 생성·수정·삭제·상태 변경이 이 배열을 사용한다. 의료진 원본은 Phase 6A의 계정 Map이다. 기본 실행 시 기존 예약 전용 의사 프로필 2개를 같은 계정 Map에 대응시켜 계정·소속 조회에서 관리할 수 있게 했다. 기존 4개 로그인 계정 및 1234는 유지하고 추가 로그인 자격 증명은 만들지 않았다. 기존 예약 프로필의 표시명과 doctorId는 보존했다.
- 예약·접수 생성 시 담당 의사와 진료과를 snapshot으로 보관하여 현재 의사의 소속 변경이 과거 업무의 진료과를 바꾸지 않도록 했다. 조회 projector는 기존 진료과 ID의 현재 이름을 반영한다. 진료 기록 원본·정정 본문·작성자 ID·버전은 유지한다.
- `MockAccountStore`의 소속 메타데이터 변경 이벤트를 선택적 `AuthService.onAccountChanged`로 전달한다. AuthProvider는 실제 로그인 중인 해당 계정의 소속을 갱신하고 이전 범위의 개인 캐시·진행 중 응답을 격리한다. 비활성화에 따른 기존 세션 무효화는 유지한다.
- 삭제의 정확한 참조 범위는 미확정이다. 현재 Mock 데이터가 참조하는 과를 강제 삭제하지 않는 보수적 검사를 사용하며 서버 정책으로 확정하지 않는다. 관련 테스트와 한계는 Phase 6B 결과 문서에 기록했다.

작업 시작 시 기존 로컬 문서가 없었다. 이 문서는 2026-11-12 실제 코드에서 확인한 구조와 이번 단계의 최소 변경만 설명한다.

- React 19 / TypeScript / Vite, React Router, TanStack Query, Axios 및 기존 CSS 토큰을 유지한다.
- `app/providers`는 QueryClient와 AuthProvider, `app/router`는 ProtectedRoute 및 역할별 화면 연결을 담당한다.
- 기존 `components/layout`의 AdminLayout·AppLayout·PageHeader, `components/ui`의 Button·Input·Select·FormField·Modal·Table·Pagination을 재사용한다. 관리자 스타일은 `.admin-workspace` 범위에만 적용한다.
- `features/admin/service.ts`는 관리자 서비스 타입과 실제 API adapter다. 기존 StaffService facade에 `admin(principal)`을 추가하여 개발용 데이터와 실제 API 교체 경계를 보존한다.
- `services/mock/identity.ts`에는 기존 역할 테스트 계정의 변하지 않는 초기 fixture를 옮겼다. `mock/auth.ts`의 기존 export를 유지하여 호출부를 바꾸지 않았다.
- `services/mock/accounts.ts`의 계정 Map이 인증·관리자 상태의 공통 원본이다. 관리자 전용 계정 배열은 두지 않는다. 소속 선택·통계는 기존 예약 저장소의 진료과를 읽고, 의사 제한은 기존 예약·접수·Visit 관계에서 계산한다.
- Mock 비활성화는 세션 폐기 세대를 증가시킨다. AuthProvider의 선택적 무효화 구독은 현재 사용자 비활성화·재설정 확정 시 세션·Query cache를 비운다. 구독이 없는 동안에도 `/me`에 해당하는 Mock 조회가 세대를 재확인한다.
- `AdminWorkspace`는 계정별 서비스·필터·Query prefix를 제공한다. 쓰기 hook은 중복 제출, unmount 및 세션 세대 변경을 확인하여 이전 요청이 다른 계정의 화면·캐시를 갱신하지 않게 한다. 민감한 입력을 MutationCache에 저장하지 않는다.
- `DEV && VITE_API_MODE=mock`일 때만 기존 동적 import로 Mock을 사용한다. 기본은 실제 API이고 운영 빌드는 Mock을 포함하지 않는다. Mock 상태는 메모리 수명이며 새로고침으로 초기화한다.

이번 작업에서 기존 직원·간호사·의사 업무 UI, 공통 레이아웃/CSS, ProtectedRoute의 권한 정책, +20px 로고 여백, backend/OpenAPI를 변경하지 않았다. 브라우저의 UI 접근 제한과 Mock 검사는 실제 서버 보안을 대체하지 않는다.
