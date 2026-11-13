# 프론트엔드 API 매핑

## Phase 6B — 진료과·의료진

실제 HTTP 서버를 추가하지 않았다. 아래 경로는 기존 명세에 맞춘 프론트엔드 Axios adapter이며 개발 시 중앙 Mock으로 동작한다. 구현: `features/admin/departmentService.ts`, `services/mock/departments.ts`.

| operationId | 경로                                            | 요청 / 응답                                                     | 권한·규칙                                                             |
| ----------- | ----------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| DEP_01      | GET `/departments`                              | 선택 `status`; `data:DepartmentSummary[]`, `meta:null`          | 공통 조회. ADMIN은 비활성 포함, 예약·소속 선택은 활성만               |
| DEP_02      | POST `/departments`                             | `{name}`; 201 `data:DepartmentSummary`, `meta:null`             | ADMIN. `409 DEPARTMENT_NAME_DUPLICATE`                                |
| DEP_03      | PATCH `/departments/{departmentId}`             | `{name}`; `data:DepartmentSummary`, `meta:null`                 | ADMIN. ID 유지, 과거 접수 조회는 현재 과 이름                         |
| DEP_04      | PATCH `/departments/{departmentId}/status`      | `{status}`; `data:DepartmentSummary`, `meta:null`               | ADMIN. 소속 의료진 잔존 시 `409 DEPARTMENT_HAS_STAFF`                 |
| DEP_05      | DELETE `/departments/{departmentId}`            | body 없음; 204 본문 없음                                        | ADMIN. `409 DEPARTMENT_IN_USE`; 연쇄 삭제 없음                        |
| DEP_06      | GET `/departments/{departmentId}/medical-staff` | 선택 `role,page,size`; `data:AccountSummary[]`, `meta:PageMeta` | ADMIN. 중앙 계정 Map에서 의사·간호사만 조회                           |
| DEP_07      | GET `/departments/{departmentId}/doctors`       | 선택 `activeOnly`; `data:DoctorSummary[]`, `meta:null`          | STAFF/NURSE/ADMIN. NURSE 본인 진료과 제한                             |
| DEP_08      | PATCH `/medical-staff/{accountId}/department`   | `{departmentId}`; `data:AccountSummary`, `meta:null`            | ADMIN. 대상 과 ACTIVE, 의사 미처리 업무 `409 DOCTOR_HAS_PENDING_WORK` |

DEP_08은 요청서의 `/accounts/...` 예시와 달리 실제 OpenAPI의 `/medical-staff/...`를 사용한다. 새로운 서버 경로를 만들지 않았다. 진료과에는 별도 상세 GET이 없으므로 DEP_01 결과에서 선택하며 검색·정렬 API를 추가하지 않았다.

OpenAPI 상단의 미결 정책 8번에 삭제를 막을 참조 이력의 정확한 범위가 미확정이라고 명시되어 있다. Mock에서는 소속 계정(비활성 포함), 현재 저장소의 예약(취소 포함), 접수(삭제 표시 포함), Visit 참조가 있으면 보수적으로 삭제를 거부한다. 이를 확정된 서버 보존 정책으로 간주하지 않는다. 간호/진료 기록은 접수·Visit 관계를 통해 보호하며 실제 서버 구현 시 추가 참조 범위를 확정해야 한다.

소속 변경 제한은 Phase 6A와 같은 미처리 업무 판정을 재사용한다. 오늘을 포함한 미래 미접수 유효 예약 또는 날짜와 무관한 미완료 접수·Visit은 차단하며 과거 미접수·취소 예약만으로는 차단하지 않는다. 소속 변경은 accountId·doctorId·과거 예약/접수/Visit의 진료과 ID를 변경하지 않는다.

변경 후 현재 계정의 업무 Query prefix 전체를 취소·무효화하여 대시보드·계정 상세·초대 활성 진료과·의료진 목록을 갱신한다. 로그인된 의료진의 소속 메타데이터 변경은 Mock 인증 구독으로 AuthProvider에 전달하고 세션 세대 및 개인 캐시를 초기화한다. 실제 서버의 세션 갱신·권한 재평가는 백엔드 연결 시 검증한다.

2026-11-12 실제 `backend/openapi.yaml`과 로컬 서비스를 확인했다. 작업 시작 시 로컬 문서가 없어 이번 Phase의 매핑을 새로 기록한다. OpenAPI 및 백엔드는 수정하지 않았다.

## Phase 6A

공통 client의 `/api/v1` baseURL 뒤에 다음 경로를 사용한다. 관리자 업무 endpoint는 ADMIN 전용이며 DEP_01은 공통 조회 권한이다. 관리자 Mock facade에서는 진료과 선택 조회도 ADMIN을 확인한다.

| operationId | 메서드·경로                                 | 요청                                          | 응답 / UI                                                                                  |
| ----------- | ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| DASH_03     | GET `/dashboards/admin`                     | 없음                                          | `data.accountsByRole`, `data.departmentsByStatus`, `meta:null`. 활성 계정만 집계           |
| ACC_01      | GET `/accounts`                             | 선택 query `name,email,role,status,page,size` | `data:AccountSummary[]`, `meta:PageMeta`. 이름·이메일 부분 일치, 역할·상태 정확 일치, AND  |
| ACC_02      | GET `/accounts/{accountId}`                 | accountId                                     | `data:AccountSummary`, `meta:null`. 상세 패널 및 404                                       |
| ACC_03      | POST `/account-invitations`                 | 필수 `name,email,role`; 의료진 `departmentId` | `data:{message}`, `meta:null`. 의사·간호사 활성 과 필수, 직원·관리자 소속 미입력           |
| ACC_04      | PATCH `/accounts/{accountId}/status`        | `{status:ACTIVE\|INACTIVE}`                   | `data:AccountSummary`, `meta:null`. `409 LAST_ACTIVE_ADMIN`, `409 DOCTOR_HAS_PENDING_WORK` |
| ACC_05      | POST `/accounts/{accountId}/password-reset` | body 없음                                     | `data:{message}`, `meta:null`. 비활성 계정도 가능, 활성 상태 변경 없음                     |
| DEP_01      | GET `/departments`                          | `status=ACTIVE`                               | `data:DepartmentSummary[]`, `meta:null`. 초대 소속 선택용 읽기만 구현                      |

실제 adapter: `frontend/src/features/admin/service.ts`. `accountId`는 경로 인코딩하며 별도 `doctorId`와 혼용하지 않는다. UI는 서비스 인터페이스를 사용하고 Axios의 `data/meta` envelope를 직접 다루지 않는다. API 오류를 Mock 성공으로 대체하지 않는다.

초대 수락·재설정 확정은 기존 Phase 2의 AUTH_04~07과 화면을 재사용한다. 새 인증 endpoint, 일반 사용자 재설정 요청 endpoint, 진료과 CRUD endpoint는 추가하지 않았다. 관리자 요청 성공은 운영 환경에서 SMTP 요청 수락이며 실제 수신함 도착의 보장이 아니다. Mock에서는 실제 발송 없이 가상 요청만 저장한다.

## 상태 및 데이터 경계

- 중앙 Mock 계정 저장소를 인증·관리자가 함께 참조한다. 기존 환자·예약·접수·Visit 저장소를 복제하지 않는다.
- 의사 미완료 업무 판단: 오늘을 포함한 미래 미접수 유효 예약, 또는 날짜와 무관한 미완료 접수·진료. 과거 미접수 예약과 취소 예약만으로 차단하지 않는다.
- 상태 변경 성공 시 관리자 계정 목록·상세·대시보드 Query를 무효화한다. 본인 비활성화·로그아웃·계정 전환은 전체 사용자 캐시와 세션 세대를 초기화한다.
- 이름·이메일 필터는 메모리에 유지하고 URL에는 페이지 번호만 기록한다. Query key에도 이름·이메일·토큰·비밀번호를 넣지 않는다.
- 초대 수락 전 계정 미생성. 관리자 Mock 초대를 기존 가입 화면에서 수락하면 메모리에 가상 계정만 추가한다. 비밀번호는 보관하지 않고 기존 4개 역할 테스트 로그인은 그대로 유지한다.

## 실제 API 연결 시 검증할 사항

현재 `backend/src/server.ts`는 API 문서와 health만 제공한다. 위 업무 API는 프론트 adapter 및 Mock 구현이며 실제 서버 연동 성공으로 간주하지 않는다.

서버 인증·ADMIN 권한, 계정 정지 및 세션 폐기, 마지막 관리자와 의사 미완료 업무의 동시성 검증, 일회용 링크 만료·소비, 비밀번호 보관·변경, SMTP 실패·수락, 실제 초대 계정 로그인, 전체 `data/meta` 계약은 백엔드 구현 후 통합 검증해야 한다. CSRF·쿠키 정책은 이번 단계에서 새로 결정하지 않았다.
