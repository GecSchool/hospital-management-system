# 병원 진료 예약 및 환자 관리 시스템 API 명세 초안

## 0. 문서 범위와 우선순위

- 기준: `병원_개념_ERD_접수담당의사_최신` 및 최근 화면·업무 결정. 과거 화면설계 문서의 임시 저장, 간호사 예약 범위 등과 차이가 있으면 최근 결정이 우선이다.
- 문서 상태: **팀 합의를 위한 초안**. `/api/v1` 경로, 필드명, 응답 형식, 인증 방식 및 §12의 미결 사항은 구현 확정 전 검토한다. 이 문서는 구현 완료를 의미하지 않는다.
- 역할: `STAFF`(병원 직원), `DOCTOR`(의사), `NURSE`(간호사), `ADMIN`(관리자). 계정 하나는 역할 하나를 갖는다. `공통`은 로그인한 네 역할을 뜻한다. 환자는 시스템 로그인 사용자가 아니다.
- 상태의 발생과 기록 생성은 서버에서 검증한다. 화면에서 버튼을 숨기는 것만으로 권한이나 정책을 보장하지 않는다.
- 접수는 예약 없이 생성할 수 있다. 예약 접수도 도착 시 접수를 생성한다. 진료는 접수에 연결되고, 진료 의사와 당시 진료과는 접수를 통해 확인한다. 진료 시작 후에는 접수의 담당 의사를 변경할 수 없다.
- 간호 기록은 **접수**에 연결되므로 진료 시작 전에도 작성할 수 있고, 진료 완료 후에도 추가할 수 있다. 의사 화면에서는 선택한 진료에 연결된 접수를 통해 간호 기록을 조회한다.
- 진료·간호 기록은 기록별 버전을 보관한다. 원본은 버전 1이고 정정 시 새 버전을 추가한다. `기록 ID + 버전 번호`를 고유하게 관리하며 원본과 이전 버전을 덮어쓰지 않는다. 완성된 진료 기록의 임시 저장 기능은 없다.
- 계정 초대 토큰과 초대 정보는 Redis에서 만료·일회성으로 관리한다. 이메일을 발송했다는 사실만으로 사용자 계정 또는 활성 관리자 수를 늘리지 않는다.

## 1. 공통 계약

### 1.1 경로와 인증

- Base URL: `/api/v1`. 기존 개발용 `/api/health`는 별도 상태 확인 경로다.
- 인증 방식 제안: 서버 세션을 `HttpOnly`, `Secure`(HTTPS), `SameSite` 설정 쿠키로 전달한다. 로그인 성공 시 세션 ID를 교체하고, 로그아웃과 계정 비활성화 시 세션을 무효화한다. 운영환경 HTTPS, 실제 쿠키 설정과 CSRF 방어 방식은 프론트·백엔드 배포 구조에 맞춰 확정한다.
- 세션 인증과 더불어 각 요청에서 현재 계정의 활성 상태, 역할, 소속과 대상 리소스 접근 범위를 확인한다. ID를 알고 있다는 사실만으로 진료·간호 기록을 열람할 수 없다.
- 공개 API는 로그인, 초대 검증·수락 및 비밀번호 재설정 토큰 검증·수락으로 한정한다.
- 이메일은 로그인 식별자이며 서버에서 공백과 대소문자 처리 정책을 일관되게 적용한다.

### 1.2 공통 타입과 직렬화

| 타입 | 계약 |
|---|---|
| ID | JSON 문자열. 클라이언트는 값을 해석하지 않는다. `doctorId`와 `DoctorSummary.id`는 별도 의사 ID가 아닌 의사의 계정 ID와 같은 값이다. |
| 날짜 | `YYYY-MM-DD`; 병원 업무 날짜는 `Asia/Seoul` 기준. |
| 시각 | `HH:mm`, 예: `09:20`. 진료 가능 시간과 예약은 20분 단위. 진료 가능 시간의 종료 경계에 한해 `24:00`을 허용한다. |
| 요일 | 0~6의 정수: 일요일 0, 월요일 1, 화요일 2, 수요일 3, 목요일 4, 금요일 5, 토요일 6. 병원 업무 시간대 `Asia/Seoul` 기준. |
| 일시 | 오프셋이 있는 ISO 8601, 예: `2026-11-09T09:20:00+09:00`; 서버 저장은 UTC 권장. |
| 생년월일 | `YYYY-MM-DD`; 주민등록번호에서 유도할 경우 입력값과 일관성을 검증한다. |
| 페이지 | 아래 1.4절. `page`, `size`는 1 이상 정수. 최초 기본 `page=1`, `size=20`은 제안이며 UI에 맞게 조정 가능. |
| 목록 정렬 | 기본·허용 정렬은 엔드포인트별로 정의하며 같은 시각에는 ID를 보조 기준으로 써서 순서를 안정화한다. |

모든 JSON의 필드명은 `camelCase`, 상태 코드는 대문자 영문을 사용한다. 선택 값은 `null`을 사용하고 필드 누락과 의미를 구분한다. URL ID·쿼리와 요청 JSON의 문자열은 서버에서 길이·형식·권한을 검증한다.

### 1.3 응답과 오류

```json
{ "data": { "id": "pat_01" }, "meta": null }
```

```json
{
  "error": {
    "code": "LAST_ACTIVE_ADMIN",
    "message": "마지막 활성 관리자 계정은 비활성화할 수 없습니다.",
    "details": null,
    "requestId": "req_01"
  }
}
```

- 성공: 조회·수정 `200`, 생성 `201`(생성된 리소스와 `Location` 권장), 본문 없는 삭제·로그아웃 `204`. `204`에는 JSON 본문이 없다.
- 오류: `400` 입력 형식 오류, `401` 인증 필요·실패, `403` 역할·범위 거부, `404` 없거나 공개하지 않는 대상, `409` 상태·동시성 충돌, `410` 만료/이미 사용된 일회성 링크, `422` 형식은 맞지만 업무 규칙 위반, `429` 요청 제한, `500` 예기치 않은 오류. 실제 오류 코드별 매핑은 아래에 명시한다.
- 공통 오류 코드: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`. 입력 오류의 `details`는 필드별 `{ "field", "reason" }` 목록을 사용할 수 있다.
- 로그인 실패는 이메일 존재 여부를 드러내지 않는다. 응답에 비밀번호, 인증 토큰 원문, 주민등록번호 전체를 포함하지 않는다. 의료기록·주민등록번호·토큰은 URL 쿼리나 로그에 남기지 않는다.

### 1.4 목록 규칙

번호형 응답: `meta`에 `page`, `size`, `totalItems`, `totalPages`를 포함한다. 조건을 모두 비우면 허용된 범위의 첫 페이지를 반환한다. 검색·필터를 바꾸면 UI는 첫 페이지부터 요청한다. 검색 결과가 없으면 `data: []`, `totalItems: 0`, `totalPages: 0`이다.

```json
{ "data": [], "meta": { "page": 1, "size": 20, "totalItems": 0, "totalPages": 0 } }
```

기록 이력 더 보기: `limit`과 불투명 `before` 커서를 사용하고 `meta`에 `nextBefore`, `hasMore`를 반환한다. 최초에는 최신 N건을 가져오되 그 묶음은 과거→현재 순으로 반환하며, `before` 요청은 더 오래된 묶음을 반환한다. 반환된 묶음을 기존 목록 앞에 추가한다. 커서는 날짜와 고유 ID의 정렬 기준을 반영한다. 본문 안의 기록 버전 목록도 정렬을 명시한다.

번호형 페이지 대상: 환자 검색, 예약 현황, 직원·간호사 접수 목록, 계정 목록, 소속 의료진, 환자 상세의 예약·접수·진료 이력. 시간표와 의사의 당일 환자 목록에는 페이지 번호를 추가하지 않는다. 간호 기록·의사 진료 이력의 긴 목록은 더 보기 방식. 진료과 목록과 의사 일간 환자 목록의 최대 반환량은 §12에서 결정한다.

### 1.5 상태값 초안

| 리소스 | 값 | 화면 표시 및 의미 |
|---|---|---|
| 계정 | `ACTIVE`, `INACTIVE` | 활성, 비활성. 미수락 초대는 Redis의 초대 상태이지 활성 계정이 아니다. |
| 진료과 | `ACTIVE`, `INACTIVE` | 활성, 비활성. 비활성은 신규 예약·현장 접수·소속 선택 불가. |
| 예약 | `BOOKED`, `CANCELLED` | 예약, 취소. 접수·진료 진행은 연결된 접수/진료에서 조회한다. 화면에 필요한 통합 표시는 서버가 합성할 수 있다. |
| 접수 | `REGISTERED`, `CALLED` | 접수 완료, 호출됨. 입실 확인 후 진료 상태로 진행을 표시한다. 삭제된 접수는 물리적으로 제거한다. |
| 진료 | `IN_PROGRESS`, `COMPLETED` | 진료 중, 진료 완료. 간호사의 입실 확인 시 `IN_PROGRESS` 생성, 의사 기록 완료 시 `COMPLETED`. |
| 기록 버전 | `versionNo=1`, `versionNo>1` | 원본, 정정. 원본의 `correctionReason`은 `null`, 정정은 필수. |

화면용 `displayStatus`는 목록·필터·상세에서 동일하게 사용한다. 취소된 예약은 `CANCELLED`(예약 취소), 유효한 접수가 없는 예약은 `BOOKED`(예약), 유효한 접수는 진료 완료 `COMPLETED`(진료 완료) → 진료 중 `IN_PROGRESS`(진료 중) → 호출 `CALLED`(호출됨) → 접수 완료 `REGISTERED`(접수 완료) 순으로 연결된 가장 진행된 상태를 표시한다. 현장 접수에도 동일한 접수 이후 상태를 쓴다. `status` 필터는 이 화면용 값을 기준으로 한다. 접수 삭제 시에는 삭제된 접수를 상태 합성에서 제외한다. 별도 미내원 상태는 제공하지 않는다.

### 1.6 공통 데이터 객체

| 객체 | 필드 초안 |
|---|---|
| `AccountSummary` | `id`, `name`, `email`, `role`, `status`, `department: DepartmentSummary?`, `doctorId?` (본인 인증 응답에서 의사일 때 필수; 나머지 역할은 `null`) |
| `DepartmentSummary` | `id`, `name`, `status` |
| `DoctorSummary` | `id`, `name`, `department: DepartmentSummary` |
| `PatientSummary` | `id`, `name`, `birthDate`, `phone`; 직원 화면 응답에는 `patientNumber` 필수. 목록에 주민등록번호 없음. 간호사 화면은 환자번호를 표시·검색하지 않는다. |
| `PatientDetail` | `PatientSummary` + `maskedResidentNumber`, 기타 승인된 등록 정보. 원본 주민등록번호는 응답하지 않는다. |
| `Appointment` | `id`, `patient: PatientSummary`, `doctor: DoctorSummary`, `department: DepartmentSummary`, `startsAt`, `status`, `displayStatus`, `registeredBy: AccountSummary`, `receptionId?`(현재 유효한 접수만), `cancelledAt?` |
| `Reception` | `id`, `patient: PatientSummary`, `department: DepartmentSummary`, `doctor: DoctorSummary`, `appointmentId?`, `receivedAt`, `status`, `displayStatus`, `visitId?`, `visitStatus?` |
| `Visit` | `id`, `receptionId`, `patient: PatientSummary`, `department: DepartmentSummary`, `doctor: DoctorSummary`, `status`, `startedAt`, `completedAt?`, `clinicalRecordId?`. `doctor`/`department`는 접수에서 읽은 응답 필드다. |
| `ClinicalRecordVersion` | `recordId`, `versionNo`, `symptoms`, `diagnosis`, `opinion`, `correctionReason?`, `author: AccountSummary`, `createdAt` |
| `NursingRecordVersion` | `recordId`, `versionNo`, `content`, `correctionReason?`, `author: AccountSummary`, `createdAt` |
| `NursingRecord` | `id`, `receptionId`, `author: AccountSummary`, `createdAt`, `latestVersion: NursingRecordVersion` |

과거 진료 응답의 진료과는 담당 의사의 현재 소속이 아니라 해당 접수에 기록된 진료과를 기준으로 조회하며, 과 이름은 현재 이름을 표시한다. `DoctorSummary.department`는 현재 소속이므로 과거 진료과 대용으로 사용하지 않는다.

응답에서의 중첩 요약은 데이터 모델의 중복 저장을 뜻하지 않는다. 직원이 보는 진료 이력은 날짜·진료과·의사·상태 등 업무에 필요한 요약만 반환하며 증상·진단·소견과 간호 기록 본문은 반환하지 않는다.

## 2. 인증 및 계정

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| AUTH-01 | `POST /auth/login` | 공개 | body `{email,password}` → `200 AccountSummary`, 세션 쿠키 | `401 INVALID_CREDENTIALS`; 비활성은 `403 ACCOUNT_INACTIVE`; 시도 제한 `429`. |
| AUTH-02 | `POST /auth/logout` | 공통 | body 없음 → `204` | 현재 세션 무효화. 이미 만료된 세션 처리의 멱등성은 구현 시 통일. |
| AUTH-03 | `GET /auth/me` | 공통 | → `200 AccountSummary` | `401`, `403 ACCOUNT_INACTIVE`. |
| AUTH-04 | `POST /auth/invitations/verify` | 공개 | body `{token}` → `200 {name,email,role,department}` | `410 INVITATION_INVALID`; 토큰 원문을 URL에 다시 노출하지 않음. |
| AUTH-05 | `POST /auth/invitations/accept` | 공개 | body `{token,password,passwordConfirm}` → `201 {accountId}` | 만료·사용됨 `410`; 불일치 `422 PASSWORD_MISMATCH`; 계정 중복 `409`. 초대 소비와 계정 생성의 실패 복구 필요. |
| AUTH-06 | `POST /auth/password-resets/verify` | 공개 | body `{token}` → `200 {valid:true}` | `410 RESET_LINK_INVALID`. |
| AUTH-07 | `POST /auth/password-resets/confirm` | 공개 | body `{token,password,passwordConfirm}` → `204` | 일회성·만료 검증. 완료 후 기존 세션 무효화 권장. |
| ACC-01 | `GET /accounts` | ADMIN | query `name?`, `email?`, `role?`, `status?`, `page?`, `size?` → `AccountSummary[]` | 이름·이메일은 각각 독립 입력, 역할·상태는 선택. 모든 조건 선택 사항; 입력된 조건만 AND 적용하며 전체 생략 시 전체 계정 첫 페이지. 이름·이메일 부분 일치, 역할·상태 정확 일치. |
| ACC-02 | `GET /accounts/{accountId}` | ADMIN | → `AccountSummary` | `404`. |
| ACC-03 | `POST /account-invitations` | ADMIN | `{name,email,role,departmentId?}` → `200 {message}` | 의료진은 활성 진료과 필수. 관리자·직원은 소속 미입력. SMTP 서버의 발송 요청 수락을 기다린 뒤 성공 반환; 수신함 도착 보장은 아님. 실패 시 오류. 초대 수락 전 계정 미생성. |
| ACC-04 | `PATCH /accounts/{accountId}/status` | ADMIN | `{status}` → `200 AccountSummary` | 마지막 활성 관리자 비활성화 `409 LAST_ACTIVE_ADMIN`. 오늘 이후의 미접수 유효 예약 또는 미완료 접수·진료가 있는 의사의 비활성화는 `409 DOCTOR_HAS_PENDING_WORK`. 과거의 미접수 예약은 차단하지 않는다. 본인 비활성화 시 세션 무효화. |
| ACC-05 | `POST /accounts/{accountId}/password-reset` | ADMIN | → `200 {message}` | SMTP 서버의 발송 요청 수락 후 성공. 메일 실제 수신 보장은 아님. 대상에게만 일회성 링크를 발송하며 실패 시 오류를 반환한다. 비활성 계정에도 발송 및 비밀번호 재설정이 가능하나 계정 상태는 비활성으로 유지되며 로그인은 허용하지 않는다. |

마지막 활성 관리자 검사는 동시 요청에도 0명이 되지 않도록 트랜잭션에서 직렬화한다. 초대 승인 전 Redis 상태를 활성 계정 수에 포함하지 않는다.

## 3. 진료과·의료진·진료 가능 시간

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| DEP-01 | `GET /departments` | 공통 | query `status?` → `DepartmentSummary[]` | 신규 예약·소속 선택은 활성 과만. ADMIN은 비활성 포함 가능. |
| DEP-02 | `POST /departments` | ADMIN | `{name}` → `201 DepartmentSummary` | 이름 중복 `409 DEPARTMENT_NAME_DUPLICATE`. |
| DEP-03 | `PATCH /departments/{departmentId}` | ADMIN | `{name}` → `200 DepartmentSummary` | 과거 접수는 당시 진료과 ID를 유지하되 조회 시 해당 과의 현재 이름을 표시한다. |
| DEP-04 | `PATCH /departments/{departmentId}/status` | ADMIN | `{status}` → `200 DepartmentSummary` | 소속 의료진이 남으면 `409 DEPARTMENT_HAS_STAFF`. |
| DEP-05 | `DELETE /departments/{departmentId}` | ADMIN | → `204` | 소속 의료진 또는 참조 이력 존재 시 `409 DEPARTMENT_IN_USE`. 참조 대상의 정확한 범위는 §12. |
| DEP-06 | `GET /departments/{departmentId}/medical-staff` | ADMIN | query `role?`, `page?`, `size?` → `AccountSummary[]` | 소속 의료진 번호형 페이지네이션과 공통 `meta` 제공. |
| DEP-07 | `GET /departments/{departmentId}/doctors` | STAFF, NURSE, ADMIN | query `activeOnly?` → `DoctorSummary[]` | 간호사는 본인 진료과로 범위를 제한. `activeOnly=true`일 때 활성 의사만 반환하고, `false` 또는 생략 시 상태로 필터링하지 않는다. |
| DEP-08 | `PATCH /medical-staff/{accountId}/department` | ADMIN | `{departmentId}` → 변경된 `AccountSummary` | 대상 과 활성 확인. 의사에게 오늘 이후의 미접수 유효 예약 또는 미완료 접수·진료가 있으면 `409 DOCTOR_HAS_PENDING_WORK`. 과거 미접수 예약은 차단하지 않는다. 과거 접수의 진료과는 당시 값 유지. |
| SCH-01 | `GET /doctors/{doctorId}/availability` | DOCTOR(본인), STAFF, NURSE(본인 과) | → `{doctorId,intervalMinutes:20,weeklySlots:[{dayOfWeek,startTime,endTime}]}` | 요일 0=일요일~6=토요일의 매주 반복 구간을 반환한다. 구간은 요일 숫자와 시작 시각 오름차순이며 연속 구간은 합쳐 반환한다. 간호사는 본인 과. 관리 기능의 관리자 접근은 §12. |
| SCH-02 | `PUT /doctors/me/availability` | DOCTOR | `{weeklySlots:[{dayOfWeek,startTime,endTime}]}` → `200 {doctorId,intervalMinutes:20,weeklySlots:[...]}` | 본인의 주간 시간표 전체 교체. 앞으로 남은 유효 예약과 충돌하면 `409 AVAILABILITY_CONFLICT`이며 기존 시간표를 유지한다. 날짜·시간 경계 및 구간 규칙은 아래 참조. 성공 시 정규화된 전체 시간표를 반환한다. |
| SCH-03 | `GET /doctors/{doctorId}/leaves` | DOCTOR(본인), STAFF, NURSE(본인 과) | query `from`, `to` → 휴진 목록 | 날짜 범위 필수. |
| SCH-04 | `POST /doctors/me/leaves` | DOCTOR | `{date}` → `201 {date}` | 취소되지 않은 예약이 해당 날짜에 있으면 `409 LEAVE_HAS_BOOKING`; 중복 휴진 `409`. 일자 전체 휴진 기준. |
| SCH-05 | `GET /doctors/{doctorId}/appointment-slots` | STAFF, NURSE(본인 과), DOCTOR(본인 재진) | query `date`, `excludeAppointmentId?` → `{date,intervalMinutes:20,slots:[{startsAt,available,reason?}]}` | 예약 변경 시 STAFF가 변경할 본인 대상 예약 ID를 전달하면 해당 예약만 점유 검사에서 제외. 예약의 의사와 경로 의사 일치 및 변경 권한·유효 상태를 서버에서 확인한다. 다른 예약·휴진·진료 가능 시간 제약은 그대로 적용. 일반 예약 조회는 생략. 같은 의사·날짜·시간의 유효 예약은 한 건만 가능. |


### 3.1 주간 진료 가능 시간 입력·저장 계약

- 화면은 매주 반복되는 20분 칸을 클릭·드래그하여 선택한다. 프론트엔드는 같은 요일의 연속 선택 칸을 하나의 `{dayOfWeek,startTime,endTime}` 구간으로 합쳐 `SCH-02`에 보낸다. 선택되지 않은 시간은 진료 불가다.
- 요일은 일요일 0, 월요일 1, 화요일 2, 수요일 3, 목요일 4, 금요일 5, 토요일 6이다. 요일을 계산하거나 날짜와 비교할 때 병원 업무 시간대 `Asia/Seoul`을 사용한다.
- 시간 구간은 시작을 포함하고 종료를 제외한다(`[startTime,endTime)`). 시작과 종료는 20분 경계(`00`, `20`, `40`분)여야 하고 종료가 시작보다 늦어야 한다. 시작은 `00:00`~`23:40`, 종료는 `00:20`~`24:00`이며 `24:00`은 종료에만 허용한다. 날짜를 넘기는 구간은 요일별로 나눈다.
- 같은 요일에서 겹치는 구간이나 중복 구간은 `400 VALIDATION_ERROR`로 거부한다. 서로 맞닿은 구간은 허용하고 서버가 하나로 합친다. 성공 응답과 조회 결과는 요일 숫자, 시작 시각의 오름차순으로 반환한다. 시간표에 없는 요일은 진료 가능 시간이 없다.
- `PUT`은 보낸 배열로 의사의 전체 주간 시간표를 교체한다. 빈 배열은 모든 진료 가능 시간을 제거하는 요청이다. 저장 당시 앞으로 남은 취소되지 않은 예약을 새 시간표로 수용할 수 없으면 `409 AVAILABILITY_CONFLICT`를 반환하며 기존 시간표를 변경하지 않는다. 과거 예약은 충돌 검사에서 제외한다. 예약 등록과 시간표 변경이 동시에 실행되어도 이 규칙이 깨지지 않도록 같은 잠금 경계에서 검사·저장한다.
- 의사 계정 ID, 요일, 시작·종료 시각의 반복 구간을 PostgreSQL에 보관한다. 저장은 자정부터의 분으로 표현하며 종료 24:00은 1440이다. 휴진은 의사 계정 ID와 날짜를 복합키로 저장한다. 시간표 조회·저장과 의사 일정의 `availability`는 이 동일한 구간 규칙을 사용한다.

예: 월요일 오전 9시~12시와 오후 1시~5시를 선택할 때 `PUT /doctors/me/availability` 요청 본문:

```json
{
  "weeklySlots": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "12:00" },
    { "dayOfWeek": 1, "startTime": "13:00", "endTime": "17:00" }
  ]
}
```

성공 시 `data`는 `{ "doctorId": "doc_01", "intervalMinutes": 20, "weeklySlots": [...] }`, `meta`는 `null`이다. 12:00부터 13:00 전까지는 진료 불가다.

## 4. 환자

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| PAT-01 | `GET /patients` | STAFF, NURSE | `name?`, `birthDate?`, `phone?`, `patientNumber?`, `page?`, `size?` → `PatientSummary[]` | 간호사는 예약 환자 선택 시 전체 환자를 이름·생년월일·연락처로 검색할 수 있음. 조건 생략 시 전체 첫 페이지. 간호사에게 환자번호 검색·표시는 제공하지 않음. 예약은 본인 과에만 등록 가능. |
| PAT-02 | `POST /patients` | STAFF | `{name,residentNumber,phone,...}` → `201 PatientDetail` | 주민등록번호·연락처 형식을 확인하며 주민등록번호 중복은 `409 RESIDENT_NUMBER_DUPLICATE`. 필수 추가 항목은 도메인 정의서 확정 후 지정. |
| PAT-03 | `GET /patients/{patientId}` | STAFF, DOCTOR, NURSE | → 역할별 `PatientDetail` 또는 필요한 축소 정보 | 의사는 허용된 진료·예약 맥락에서만, 간호사는 허용된 본인 과 업무 맥락에서만 조회. |
| PAT-04 | `PATCH /patients/{patientId}` | STAFF | `{name?,residentNumber?,phone?,...}` → `PatientDetail` | 응답은 마스킹. 변경하지 않을 주민등록번호는 필드를 생략하며 마스킹 문자열은 유효한 원본 입력이 아니다. 번호 변경 허용 여부는 §12. 변경을 허용하는 경우 다른 환자와 중복되면 `409 RESIDENT_NUMBER_DUPLICATE`. |
| PAT-07 | `GET /patients/{patientId}/visits` | STAFF | `page?`, `size?` → `[{visitId,patientId,department:{id,name},doctor:{id,name},completedAt,displayStatus}]` | 진료 본문 제외. 직원 재진 예약의 환자·진료과·의사 초기값에 사용; 이후 소속·활성 검사는 예약 시 다시 수행. |

환자 상세 예약·접수 이력은 각각 `APT-02`, `REC-02`에 `patientId`를 전달해 조회한다.

`residentNumber` 전송은 TLS 요청 본문으로만 허용하고 표시·로그에서는 마스킹한다. 주민등록번호 중복을 막기 위해 동일 번호는 동일한 비밀키 기반 조회값으로 변환하여 유일성을 검사하고, 별도로 암호화된 값을 저장한다. 조회값 생성·암호화·키 관리와 변경 처리는 API 구현 전에 완성해야 한다. 실제 의료정보 대신 시연용 가상 데이터를 사용한다.

## 5. 예약

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| APT-01 | `POST /appointments` | STAFF, NURSE(본인 과) | `{patientId,departmentId,doctorId,startsAt}` → `201 Appointment` | 활성 상태·소속·진료 가능 시간·휴진 및 동일 의사·동일 시각 유효 예약 한 건 제한을 원자적으로 검증. `409 SLOT_UNAVAILABLE`. 등록자는 세션 계정. |
| APT-02 | `GET /appointments` | STAFF, NURSE(본인 과) | `patientId?`, `patientName?`, `date?`, `departmentId?`, `doctorId?`, `status?`, `page?`, `size?` → `Appointment[]` | `patientId`는 환자 ID 정확 일치로 환자 예약 이력 조회에 사용. 입력된 조건을 함께 적용한다. `status`는 화면용 `displayStatus` 필터. 간호사는 환자 ID를 지정해도 본인 과 조회만 가능하며 변경·취소 불가. |
| APT-03 | `GET /appointments/{appointmentId}` | STAFF, NURSE(본인 과), DOCTOR(본인 관련) | → `Appointment` | 역할·소속·담당 범위 검사. |
| APT-04 | `PATCH /appointments/{appointmentId}/time` | STAFF | `{startsAt}` → `Appointment` | 유효 접수가 없는 예약만 변경. 기존 시각 그대로면 변경 없이 기존 예약 반환(새 이력 미생성); 동일 의사·시간 예약 한 건 제한과 동시성 검사; `409 SLOT_UNAVAILABLE`, 접수 후 `409 APPOINTMENT_ALREADY_RECEIVED`. |
| APT-05 | `POST /appointments/{appointmentId}/cancel` | STAFF | 본문 없음 → `Appointment` | 유효 접수가 없는 예약만 취소; 접수 후 `409 APPOINTMENT_ALREADY_RECEIVED`. 취소 사유는 입력받지 않고 취소자·시각을 기록한다. |
| APT-06 | `POST /visits/{visitId}/follow-up-appointments` | DOCTOR(해당 완료 진료 담당) | `{startsAt}` → `201 Appointment` | 진료 완료 후만 가능. 환자·의사·진료과는 진료→접수에서 결정하며 클라이언트가 선택·변경하지 않는다. 예약 시점에 진료 가능 시간, 휴진 및 동일 의사·시간의 유효 예약을 다시 검증하고 예약할 수 없으면 `409 SLOT_UNAVAILABLE`을 반환한다. 새 예약은 독립 예약이며 이전 진료 기록에 FK가 반드시 필요한 것은 아니다. |

예약 변경 화면은 `APT-03`의 기존 시각을 선택 표시하고 값이 바뀌기 전에는 저장을 비활성화한다. 변경 대상 예약의 날짜에는 `SCH-05`에 `excludeAppointmentId`를 전달한다. 서버는 저장 시점에 점유 여부를 다시 검증한다.

같은 의사의 같은 날짜·시각에는 유효 예약을 한 건만 허용한다. 취소된 예약은 자리를 차지하지 않는다. 현장 접수는 예약 슬롯을 선택하거나 점유하지 않는다. 조회와 저장·변경 검증에 같은 기준을 적용한다.

## 6. 접수 및 호출

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| REC-01 | `POST /receptions` | STAFF | 예약 `{appointmentId}` 또는 현장 `{patientId,departmentId,doctorId}` → `201 Reception` | 상호 배타. 예약 당일 접수만 허용. 동일 환자·의사·업무 날짜에 미완료 유효 접수가 있으면 `409 DUPLICATE_ACTIVE_RECEPTION`. 진료 완료 후 재접수 및 다른 의사 접수 가능. 취소 예약·동일 예약 유효 접수 중복 거부. 삭제 후 재접수 가능. |
| REC-02 | `GET /receptions` | STAFF, NURSE | `date?`, `patientId?`, `departmentId?`, `doctorId?`, `name?`, `birthDate?`, `status?`, `page?`, `size?` → `Reception[]` | `date` 또는 `patientId` 중 하나 이상 필수; 둘 다 없거나 빈 값만 있으면 `400 VALIDATION_ERROR`. 둘 다 있으면 함께 적용. `patientId`는 환자 ID 정확 일치로 환자 접수 이력 조회에 사용. 삭제된 접수는 목록과 이력에서 제외. 간호사는 환자 ID를 지정해도 본인 과 접수만 조회. `status`는 화면용 `displayStatus`; 접수 완료 필터에 호출·진료 중·완료는 포함하지 않음. 과거 날짜 조회 가능. |
| REC-03 | `GET /receptions/{receptionId}` | STAFF, NURSE(본인 과), DOCTOR(담당) | → `Reception` | 대상의 접수·진료 상태 및 권한 검사. |
| REC-04 | `DELETE /receptions/{receptionId}` | STAFF | → `204` | 간호 기록이 있으면 `409 RECEPTION_HAS_NURSING_RECORDS`. 진료 시작 후 삭제 불가 `409 VISIT_ALREADY_STARTED`. 접수 행을 물리 삭제하며 예약은 보존한다. 삭제된 접수는 목록·환자 이력과 현재 유효 접수에서 제외한다. 호출된 접수도 간호 기록이 없고 진료가 시작되지 않았다면 삭제 가능하며 해당 호출은 해제된다. |
| REC-05 | `POST /receptions/{receptionId}/call` | NURSE(본인 과) | → `200 {reception,previousCalledReceptionId}` | 접수 완료 환자를 `CALLED`로 변경. 같은 의사가 진료 중이면 호출 불가 `409 DOCTOR_BUSY`. 같은 의사의 기존 호출은 자동 해제해 `REGISTERED`로 되돌림; 다른 의사는 영향 없음. 확인·호출 교체는 원자적으로 처리. |
| REC-07 | `POST /receptions/{receptionId}/confirm-entry` | NURSE(본인 과) | → `201 Visit` | `CALLED` 접수의 입실을 확인하고 `IN_PROGRESS` 진료 생성. 호출 교체와 동시 실행 시 현재 호출 상태 재검사; 동일 의사 동시 진료 금지 `409 DOCTOR_BUSY`. |

호출 전환은 기존 호출 해제와 새 호출 지정을 하나의 원자적 작업으로 처리한다. 입실 확인 시 현재 호출 여부와 의사의 진행 중 진료를 검증하고 진료를 생성한다. 의사는 접수의 담당 의사를 통해 판별한다. 같은 의사가 진료 중이면 새로운 호출을 허용하지 않는다. 자동 호출 취소는 입실 전 호출에만 적용하며 예약 환자 우선순위는 자동으로 부여하지 않는다.

## 7. 진료와 진료 기록

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| VIS-01 | `GET /doctors/me/patients` | DOCTOR | `date`, `status?` → `DoctorPatientRow[]` | 선택 날짜·담당 의사의 환자 목록. 행은 `patient`, `appointmentId?`, `receptionId?`, `visitId?`, `clinicalRecordId?`, `displayStatus`, `displayTime`을 포함. 예약·접수 연결 시 한 행으로 합침. 페이지 번호 없음. |
| VIS-02 | `GET /visits/{visitId}` | DOCTOR(담당) | → `Visit` | 접수에서 환자·진료과·의사를 확인. |
| VIS-03 | `GET /patients/{patientId}/clinical-history` | DOCTOR(본인 예약·접수 환자) | `limit?`, `before?` → 이력 요약 `[{visitId,receptionId,clinicalRecordId,department,doctor,completedAt,summary}]`, `nextBefore`, `hasMore` | 허용된 환자의 전체 완료 진료를 선택 날짜 제한 없이 반환하며, 다른 의사의 기록과 선택한 진료보다 나중의 기록도 포함한다. 날짜·고유 ID 기준 과거→현재 표시, 선택된 진료는 클라이언트가 `visitId`로 강조한다. 초진은 빈 배열. 예약·접수 완료에는 오늘 기록을 생성하지 않는다. |
| VIS-04 | `POST /visits/{visitId}/complete` | DOCTOR(담당) | `{symptoms,diagnosis,opinion}` → `200 {visit,record,version}` | `IN_PROGRESS`만 가능. 진료 기록과 원본 버전 1 생성, 진료 완료를 원자적으로 처리. 중복 완료 `409 VISIT_ALREADY_COMPLETED`. 별도 임시 저장 API 없음. |
| VIS-05 | `GET /clinical-records/{recordId}` | DOCTOR(허용 범위) | → `{id,visitId,latestVersion,versions:[{versionNo,author,createdAt}]}` | 기본 최신. 기록은 진료를, 진료는 접수를 거쳐 담당 의사/환자를 확인한다. |
| VIS-06 | `GET /clinical-records/{recordId}/versions/{versionNo}` | DOCTOR(허용 범위) | → `ClinicalRecordVersion` | 원본 1번에는 정정 사유 없음; 특정 버전 선택 시 해당 내용. |
| VIS-07 | `POST /clinical-records/{recordId}/versions` | DOCTOR(해당 진료 담당) | `{baseVersionNo,symptoms,diagnosis,opinion,correctionReason}` → `201 ClinicalRecordVersion` | 담당 의사만 정정 가능. 최신 버전 불일치 `409 VERSION_CONFLICT`; 사유 필수, 기존 버전 보존. |

같은 진료 기록의 `(recordId,versionNo)`는 유일하다. 버전 번호 할당과 삽입은 충돌을 방지하도록 트랜잭션으로 처리한다. 원본/정정 버전 조회 권한과 범위를 서버에서 각각 검사한다.

## 8. 간호 기록

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| NUR-01 | `GET /receptions/{receptionId}/nursing-records` | NURSE(본인 과), DOCTOR(본인 예약·접수 환자) | `limit?`, `before?` → `NursingRecord[]` | 해당 접수의 기록 조회. 간호사의 다른 날짜 이력은 NUR-06 사용. 의사는 해당 진료에 연결된 접수 기준 조회. |
| NUR-02 | `POST /receptions/{receptionId}/nursing-records` | NURSE(본인 과) | `{content}` → `201 NursingRecord` | 접수 후 진료 전·진료 중·완료 후 작성 가능. 작성자·기록 시각 서버 결정; 원본 버전 1 생성. 삭제된 접수에는 기록할 수 없다. |
| NUR-03 | `GET /nursing-records/{recordId}` | NURSE(본인 과), DOCTOR(본인 예약·접수 환자) | → `{id,receptionId,latestVersion,versions:[{versionNo,author,createdAt}]}` | 기록 본문 및 버전 이력 조회. 관리자·직원은 본문 열람 불가. |
| NUR-04 | `GET /nursing-records/{recordId}/versions/{versionNo}` | NURSE(본인 과), DOCTOR(본인 예약·접수 환자) | → `NursingRecordVersion` | 원본·선택 정정의 본문과 사유. 관리자·직원은 열람 불가. |
| NUR-05 | `POST /nursing-records/{recordId}/versions` | NURSE(기록이 연결된 접수의 진료과와 현재 소속이 일치) | `{baseVersionNo,content,correctionReason}` → `201 NursingRecordVersion` | 같은 진료과의 다른 간호사도 정정 가능. 최초 작성자는 변경하지 않고 새 버전 작성자는 로그인한 간호사로 기록한다. 사유 필수, 최신 버전 충돌 `409 VERSION_CONFLICT`. 기존 버전 보존. |
| NUR-06 | `GET /patients/{patientId}/nursing-records` | NURSE(본인 과) | `receptionId`, `limit?`, `before?` → `NursingRecord[]`, `meta:{nextBefore,hasMore}` | 지정한 접수와 환자·본인 진료과를 검사. 같은 환자의 같은 진료과의 다른 날짜 접수 이력을 선택 접수보다 이전·이후 모두 포함하며 다른 진료과는 제외. 기록별 `receptionId`, `receivedAt`, 최신 버전·작성자·작성 시각 반환. 이력은 과거→현재; `receptionId`로 현재 접수 기록을 구분하며 새 기록은 선택 접수에 NUR-02로 저장. |

## 9. 대시보드 및 일정

| ID | 메서드 · 경로 | 권한 | 요청 / 성공 | 주요 실패·규칙 |
|---|---|---|---|---|
| DASH-01 | `GET /dashboards/staff` | STAFF | query `date?` 기본 오늘 → `{date,receptionPreview: Reception[],appointmentPreview: Appointment[]}` | 접수 행은 접수 시각·환자·진료과·의사·예약/현장 구분(`appointmentId` 유무)·상태, 예약 행은 예약 시각·환자·진료과·의사·상태 및 각 ID를 제공. 접수는 최근 접수 순. 제한된 미리보기이며 전체 보기는 목록 API로 이동. |
| DASH-02 | `GET /doctors/me/schedule` | DOCTOR | `from`, `to` → `{from,to,availability,leaves,appointments,receptions,visits}` | `availability:[{dayOfWeek,startTime,endTime}]`, `leaves:[{date}]`, `appointments:Appointment[]`, `receptions:Reception[]`, `visits:Visit[]`. 연결 ID와 각 시각·상태로 시간표와 날짜별 목록 구성. 예약 목록과 내원 목록에는 연결된 동일 환자가 각각 표시될 수 있으나 시간표에서는 연결된 예약·접수를 한 항목으로 합성. 한 의사 동일 시간 유효 예약 한 건; 현장 접수는 별도. 페이지 번호 없음. |
| DASH-03 | `GET /dashboards/admin` | ADMIN | → `{accountsByRole,departmentsByStatus}` | 역할별 수는 `ACTIVE` 계정만 집계. 미가입 초대·비활성 계정 제외. 진료과 수는 활성·비활성 별도 집계. |

## 10. 화면 흐름과 API 연결

1. 관리자 계정 초대: `ACC-03` → 이메일 링크 → `AUTH-04` → `AUTH-05` → `AUTH-01`. 초대 메일 발송과 가입은 별개.
2. 직원 예약: `PAT-01/03` → `DEP-01/07` → `SCH-05` → `APT-01` → `APT-03`. 취소·시간 변경은 `APT-05/04`.
3. 예약 접수: `APT-02/03` → `REC-01 {appointmentId}` → `REC-02`. 현장 접수는 환자 선택 후 `REC-01 {patientId,departmentId,doctorId}`.
4. 간호사 호출: `REC-02` → `REC-05` 호출(같은 의사의 기존 호출 자동 해제) → `REC-07` 입실 확인 → 진료 중인 `Visit` 생성. 수동 호출 취소 없음.
5. 의사 기록: `VIS-01` → 환자 선택 → `VIS-03` 및 필요 시 `VIS-05/06`, `NUR-01/03/04`. 접수 전 예약이나 접수 완료 상태에서도 이전 기록을 열람할 수 있으나 오늘 진료 기록 작성은 진료 중에만 가능.
6. 진료 완료·재진: `VIS-04` → `VIS-05` → `APT-06`(과·의사 고정). 예약 실패와 성공은 화면 안내.
7. 간호 기록: `REC-02/03` → `NUR-06`(같은 환자·같은 과, 다른 접수 포함) → `NUR-02`(선택 접수에 저장) → `NUR-03/04/05`. 접수에 연결하므로 진료 전/완료 후 작성 가능.
8. 의료진 및 진료과: `DEP-01/06/08` → `DEP-04/05`. 비활성화와 삭제의 제한 조건을 각각 확인.

### 10.1 대표 요청·응답 예시

아래 값은 화면 연동을 설명하기 위한 가상 데이터이며, 모든 엔드포인트의 가능한 필드나 정책을 확정하는 것은 아니다.

**환자 목록 — 번호형 페이지**

`GET /api/v1/patients?name=김&page=1&size=20`

```json
{
  "data": [
    { "id": "pat_01", "patientNumber": "P0001042", "name": "김서연", "birthDate": "1985-03-14", "phone": "010-0000-0001" }
  ],
  "meta": { "page": 1, "size": 20, "totalItems": 1, "totalPages": 1 }
}
```

**환자별 예약·접수 이력 — 통합 목록 API**

`GET /api/v1/appointments?patientId=pat_01&page=1&size=20`은 해당 환자의 예약 이력을 반환한다. `GET /api/v1/receptions?patientId=pat_01&page=1&size=20`은 삭제되지 않은 접수 이력을 반환한다. 직원 응답은 각각 `StaffAppointment[]`, `StaffReception[]`과 번호형 `meta`를 사용한다. 간호사에게는 본인 진료과 범위만 반환한다.

`GET /api/v1/receptions?date=2026-11-09`는 기존 날짜별 조회다. `date`와 `patientId`를 모두 지정하면 두 조건을 함께 적용하며, 둘 다 없거나 빈 값만 있으면 `400 VALIDATION_ERROR`다.

**예약 가능 시간 — 20분 단위, 불가 시간 포함**

`GET /api/v1/doctors/doc_01/appointment-slots?date=2026-11-09`

```json
{
  "data": {
    "date": "2026-11-09",
    "intervalMinutes": 20,
    "slots": [
      { "startsAt": "2026-11-09T09:00:00+09:00", "available": true, "reason": null },
      { "startsAt": "2026-11-09T12:00:00+09:00", "available": false, "reason": "OUTSIDE_WORKING_HOURS" }
    ]
  },
  "meta": null
}
```

같은 의사의 해당 시각에 유효한 예약이 있으면 `available:false`다. 취소된 예약은 제외한다. `reason`의 전체 허용 값은 구현 전에 명세한다.

**예약 환자 접수와 현장 접수 — 요청 형식**

`POST /api/v1/receptions`

```json
{ "appointmentId": "apt_01" }
```

또는 같은 엔드포인트에 다음을 보낸다.

```json
{ "patientId": "pat_01", "departmentId": "dep_01", "doctorId": "doc_01" }
```

두 형식의 필드를 섞으면 `400 VALIDATION_ERROR`. 성공 시 `201`과 `Reception` 객체를 반환한다.

**간호사 호출과 입실 확인**

`POST /api/v1/receptions/rec_01/call` (본문 없음) → `200`

```json
{ "data": { "reception": { "id": "rec_01", "status": "CALLED", "displayStatus": "CALLED" }, "previousCalledReceptionId": "rec_02" }, "meta": null }
```

`previousCalledReceptionId`는 같은 의사의 이전 호출이 없으면 `null`이다. 위 `reception`은 핵심 필드만 보인 축약 예시다. 이어서 `POST /api/v1/receptions/rec_01/confirm-entry`에 본문 없이 요청하면 `201`과 `IN_PROGRESS` 진료를 반환한다. 호출만으로 진료를 생성하지 않는다.

**진료 기록 정정 — 최신 버전을 기준으로 새 버전 생성**

`POST /api/v1/clinical-records/cr_01/versions`

```json
{
  "baseVersionNo": 1,
  "symptoms": "기침 및 인후 불편감",
  "diagnosis": "상기도 감염 의심",
  "opinion": "경과 관찰",
  "correctionReason": "진단 표현 보완"
}
```

```json
{
  "data": {
    "recordId": "cr_01", "versionNo": 2,
    "symptoms": "기침 및 인후 불편감", "diagnosis": "상기도 감염 의심", "opinion": "경과 관찰",
    "correctionReason": "진단 표현 보완",
    "author": { "id": "acc_01", "name": "박지훈", "email": "doctor@example.test", "role": "DOCTOR", "status": "ACTIVE", "department": { "id": "dep_01", "name": "내과", "status": "ACTIVE" } },
    "createdAt": "2026-11-10T10:00:00+09:00"
  },
  "meta": null
}
```

간호 기록 정정도 같은 규칙을 쓰되 본문 필드는 `content`다. `baseVersionNo`가 최신 버전이 아니면 `409 VERSION_CONFLICT`를 반환하고, 클라이언트는 최신 내용을 다시 조회한다. 정정 기록을 원본으로 바꾸거나 기존 버전을 수정하지 않는다.

## 11. 무결성과 동시성 설계 기준

- 진료 담당 의사는 접수의 의사로만 결정한다. 별도의 `visit.doctorId`를 권위 데이터로 쓰지 않는다. 접수 생성 후 담당 의사는 변경하지 않는다.
- 진료과는 의사 소속이 바뀌어도 과거 접수에 기록된 당시 진료과를 사용한다. 진료 완료 후 의사 변경을 막아 과거 기록의 담당 의사가 바뀌지 않게 한다.
- 예약 가능 시간 조회 후 실제 저장까지 상황이 바뀔 수 있다. 저장·변경 시 근무시간, 휴진, 활성 상태와 같은 의사·시간의 유효 예약 한 건 제한을 원자적으로 재검사한다.
- 휴진 신청과 예약 등록, 진료 가능 시간 변경과 예약 등록의 동시 요청에도 충돌 규칙이 깨지지 않게 잠금/제약 전략을 논리·물리 모델에서 확정한다.
- 한 의사당 입실 전 호출은 하나만 유지한다. 진료 중인지 확인하는 절차, 기존 호출 자동 해제와 새 호출을 같은 잠금 경계에서 원자적으로 처리한다. 진료 중에는 추가 호출을 막고 입실 확인 시 현재 호출과 진행 중 진료를 재검사한다. 수동 호출 취소는 없지만 삭제가 허용된 호출 접수의 삭제 시 호출은 해제한다.
- 접수 삭제와 간호 기록 생성이 동시에 발생해도 기록이 있는 접수가 삭제되지 않도록 두 요청의 확인·저장을 동일한 잠금 경계에서 처리한다. 같은 환자·의사·날짜의 중복 미완료 접수 검사와 생성도 원자적으로 처리한다.
- 원본·정정 버전은 삭제/덮어쓰기하지 않는다. `baseVersionNo`로 최신 버전 정정 여부를 확인하고 `(recordId,versionNo)` 유일성과 동시 저장 충돌을 처리한다. 간호 기록과 진료 기록의 버전은 서로 독립적이다.
- 활성 관리자 수 검사와 비활성화는 동시 요청까지 고려해 원자적으로 수행한다. 관리자 역할이 아닌 계정은 관리자 권한을 얻을 수 없다.
- 보호 정보의 목록·상세 노출 필드는 역할별 최소 범위를 적용한다. 민감 정보·토큰·비밀번호는 로그에 기록하지 않으며, 진료·간호 기록 정정의 수행자·시각은 추적할 수 있도록 설계한다.

직원 계정의 소속은 진료과로 관리하지 않으며 계정 목록에서 `-`로 표시한다. 계정 검색 조건을 전부 비우면 전체 계정을 반환하고, 일부만 입력하면 해당 조건만 적용한다. 로그인 중인 관리자 자신의 계정 상태 변경도 동일하게 검사한다.

## 12. 결정하지 않은 사항과 확정 정책의 경계

확정 정책은 위에 반영했으며, 아래 항목은 임의로 확정하지 않는다.

1. **진료 중 추가 호출:** 같은 의사가 진료 중일 때 호출을 차단한다. 입실 확인에서도 동시 진료 금지 규칙을 검증한다.
2. **접수 삭제 세부:** 간호 기록이 있거나 진료가 시작된 접수는 삭제 불가. 호출됨 상태도 이 조건을 만족하면 삭제할 수 있고 호출이 해제된다. 접수 행을 물리 삭제하므로 목록·환자 이력에 남지 않는다. 연결된 예약은 유지하며 같은 예약으로 다시 접수할 수 있다.
3. **간호 기록 시간 범위:** 같은 환자의 같은 과 기록은 선택 접수의 전후를 모두 조회한다. 선택 접수 표시와 새 기록의 연결 대상은 해당 `receptionId`를 기준으로 한다.
4. **예약 환자 검색:** 간호사는 전체 환자를 검색할 수 있으며 예약 등록은 본인 과만 가능, 변경·취소는 불가.
5. **접수 담당 의사 변경:** 화면 범위에서 제외하며 접수 생성 후에는 담당 의사를 변경하지 않는다.
6. **미내원·예약 우선순위:** 미내원 상태 및 예약 환자 자동 우선순위는 제공하지 않는다. 간호사가 호출 대상을 선택한다.
7. **예약 시간 변경 화면:** `excludeAppointmentId`로 변경 대상 예약만 점유 검사에서 제외하고 현재 시각을 선택 표시한다. 변경이 없으면 저장 버튼을 비활성화한다. 예약 가능 시간의 `reason` 값 목록은 미정. 동일 의사·동일 시간에는 예약 한 건만 허용하고 현장 접수 인원까지 제한하지 않는다.
8. **진료과 삭제:** 의료진 외 예약·접수·진료 이력 중 삭제 제한에 포함할 참조 범위 미정. 과 이름은 과거에도 현재 이름으로 표시.
9. **의사 미처리 업무:** 오늘 이후 미접수 유효 예약 및 미완료 접수·진료가 있으면 계정 비활성화·소속 변경을 제한한다. 지난 날짜의 미접수 예약은 제한하지 않는다. 비활성 계정도 비밀번호를 재설정할 수 있으나 자동 활성화되지는 않는다.
10. **환자 주민등록번호:** 중복 등록은 허용하지 않는다. 변경 허용 여부와 추가 필수값·보호 저장의 세부 정책은 미정이며, 변경을 허용할 경우에도 중복을 허용하지 않는다. 미변경 시 생략, 응답 마스킹.
11. **관리자 목록·초대:** 별도 검색 조건과 활성 계정 집계는 확정. SMTP 요청 실패 후 재시도·Redis/DB 실패 복구는 구현 전에 정한다.
12. **인증 세부:** 세션 저장소·만료·CSRF·실패 횟수·토큰 유효기간, 메일과 Redis/DB 간 실패 복구 정책 미정.
13. **기록 정정:** 진료 기록은 담당 의사만 정정한다. 간호 기록은 해당 접수의 진료과와 현재 소속이 일치하는 간호사라면 최초 작성자가 아니어도 정정할 수 있다. 최초 작성자는 유지하고 각 버전의 실제 작성자를 기록한다.
14. **목록 응답 세부:** 진료과 목록과 의사 일간 환자 목록의 최대 반환량, 기록 조회 시 환자 접근 맥락 전달 방식은 구현 전 구체화한다.

## 13. 작성 및 검토 순서

공통 계약 → 인증·계정 → 진료과·의료진·시간 → 환자 → 예약 → 접수·호출 → 진료 기록 → 간호 기록 → 대시보드·일정 순으로 정리했다. 공통 규칙과 핵심 관계가 합의되면 진료과·환자, 진료 기록·간호 기록은 병렬로 검토할 수 있다. 각 API의 필드·상태·오류와 §12의 결정을 논리 ERD·도메인 정의서에 반영한 뒤 구현 계약을 확정한다.
