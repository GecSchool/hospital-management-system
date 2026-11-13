# 04. 기능·상태·권한 차이

검수일: 2026-11-12 KST. 브랜치 `feat/frontend`. **Audit Only**: 코드·CSS·테스트·기존 문서·OpenAPI·Figma는 수정하지 않았다. 판정은 정적 코드와 실제 Figma 데이터의 대조이며 실행 화면의 픽셀 일치를 뜻하지 않는다.

## 우선순위별 확인 이슈

P0 확인 0건. 서비스의 데이터 보존·권한 테스트가 통과했다는 사실로 모든 보안을 보장하지 않는다. 아래는 정적 근거가 있는 21개 문제이며, 같은 문제의 여러 reaction을 중복 이슈로 세지 않았다.

### D01 · P1 · NOT_IMPLEMENTED — 의사 / 입실 전 환자 기록 조회

- Figma: 193:14204 → 217:12265·217:12432·217:12517. 예약·접수 완료·호출 상태도 기록 보기로 이동한다.
- React: visitId가 없으면 입실 확인 대기 텍스트만 출력한다. history query도 visit.data가 있어야 활성화한다.
- 근거: [ClinicalPage.tsx:192](../../../frontend/src/features/doctor/ClinicalPage.tsx#L192).
- 제안: 예약/접수 맥락의 읽기 전용 환자 이력 화면을 연결한다. Visit을 새로 생성하지 않는다. VIS_03을 사용하고 VIS_05 상세 범위는 확인한다.

### D02 · P1 · NOT_IMPLEMENTED — 의사 / 과거 진료 선택

- Figma: 193:14167·193:14168 → 193:14357; 193:14171 → 193:14390. 9월·10월 이력을 선택하면 해당 진료 본문으로 바뀐다.
- React: 이력은 이벤트 없는 article이며 본문은 URL의 visitId에 고정된다.
- 근거: [ClinicalPage.tsx:278](../../../frontend/src/features/doctor/ClinicalPage.tsx#L278).
- 제안: 선택 이력과 현재 작성 중 Visit을 분리한다. 본인 기록부터 연결하고 초안 보존·담당 의사 제한을 회귀 검증한다.

### D03 · P1 · NOT_IMPLEMENTED — 의사 / 일정에서 환자 선택

- Figma: 193:16383 → 193:14147; 193:17381 → 193:14147; 221:15896. 주간 슬롯 및 일간 예약·내원 행에서 진료/기록으로 이동한다. 같은 시간 여러 환자는 선택 패널을 제공한다.
- React: 주간은 p 이름, 일간 목록은 span만 렌더링한다. 환자 클릭 및 다중 환자 선택 핸들러가 없다.
- 근거: [DoctorPage.tsx:253](../../../frontend/src/features/doctor/DoctorPage.tsx#L253).
- 제안: 기존 ID 관계로 이동 링크와 동일 슬롯 선택 패널을 연결한다. 중복 예약을 새로 만들지 않는다.

### D04 · P1 · NOT_IMPLEMENTED — 의사 / 미저장 진료 이탈

- Figma: I193:14148;41:198 → 193:14562; :199 → 193:14598; :200 → 193:14634. 진료 일정·환자 진료·진료 시간 설정으로 나갈 때 계속 작성/나가기 확인을 제공한다.
- React: draft는 ClinicalForm 로컬 상태이고 공통 메뉴는 즉시 Link 이동한다. 전체 src에 이탈 가드가 없다.
- 근거: [ClinicalPage.tsx:366](../../../frontend/src/features/doctor/ClinicalPage.tsx#L366).
- 제안: dirty 여부와 보류 목적지를 보존하는 최소 가드를 만든다. 계속 작성은 동일 초안을 유지하고 나가기 확정 후 이동한다.

### S01 · P1 · FAIL — 직원 / 예약 취소 완료 복귀

- Figma: I193:7966;37:170 → 193:8065. 취소 확정 후 취소 상태가 반영된 예약 목록으로 돌아간다.
- React: 취소 성공 후 setConfirm(false)와 onCancelled만 실행한다. onCancelled는 notice만 바꾸며 상세 URL과 패널이 남는다.
- 근거: [AppointmentListPage.tsx:329](../../../frontend/src/features/appointments/AppointmentListPage.tsx#L329).
- 제안: 성공 시 현재 검색 조건·페이지를 보존한 목록으로 닫는다. 취소 자체의 데이터 변경은 유지한다.

### S02 · P1 · FAIL — 직원 / 현장 접수 완료 복귀

- Figma: I193:6667;83:220 → 193:8893. 현장 접수 확정 후 접수 현황으로 이동한다.
- React: 성공 callback은 setWalkin(false), setCheckinNotice(true)만 실행해 환자 상세에 머문다. 데이터 생성 및 캐시 갱신은 실행한다.
- 근거: [PatientDetailPage.tsx:120](../../../frontend/src/features/staff/PatientDetailPage.tsx#L120).
- 제안: 성공 시 기존 접수 목록으로 이동하도록 계획한다. 현장 접수가 예약을 생성하지 않는 기존 규칙은 유지한다.

### S03 · P1 · FAIL — 직원 / 재진 예약 초기값

- Figma: 193:6635 → 193:7034; OpenAPI PAT_07 2415행. 이력의 환자·진료과·의사로 재진 예약을 시작한다. Figma 193:7034도 내과·박지훈이 선택된 상태다.
- React: 이력 Link는 state.patientId만 전달한다. AppointmentForm의 departmentId/doctorId는 신규 STAFF 예약에서 빈 문자열로 시작한다.
- 근거: [PatientHistory.tsx:113](../../../frontend/src/features/staff/PatientHistory.tsx#L113).
- 제안: 선택 이력의 patient/department/doctor 초기값을 안전하게 전달한다. 활성 상태·현재 소속·슬롯은 저장 시 다시 확인한다. Visit 생성/기존 진료 변경은 하지 않는다.

### S04 · P2 · PARTIAL — 직원 / 예약일 이전 접수 제한 안내

- Figma: 280:20903 → 280:21129 / 예약 환자 접수 ON_CLICK. 예약일 이전 상세에서 접수 버튼을 누르면 제한 안내 상태 Frame으로 이동한다.
- React: receptionEligibility가 있으면 버튼 disabled와 설명 문구로 제한해 클릭 후 안내 상태로 이동하지 않는다. 당일 접수 제한 업무 규칙은 유지한다.
- 근거: [AppointmentListPage.tsx:376](../../../frontend/src/features/appointments/AppointmentListPage.tsx#L376).
- 제안: 제한 UX를 비활성 안내로 유지할지 클릭 후 설명 상태로 맞출지 결정한다. REC_01의 예약일 당일 제한을 풀지 않는다. 추가 상태 Frame 외형은 미검증이다.

### D05 · P2 · PARTIAL — 의사 / 진료 시간 저장 피드백

- Figma: 193:15584 → 215:12186; 193:15594 확인 → 193:15611. 저장 성공 및 미래 예약 충돌을 확인 대화상자로 표시한다.
- React: 성공은 setNotice, 충돌은 write.error 인라인 안내다. 저장·충돌 업무 규칙은 구현되어 있다.
- 근거: [DoctorPage.tsx:175](../../../frontend/src/features/doctor/DoctorPage.tsx#L175).
- 제안: 공통 Modal로 표시 방식과 확인 후 편집 복귀를 맞춘다. 저장 전 확인이 Figma에 있다고 추정하지 않는다.

### D06 · P2 · PARTIAL — 의사 / 재진 예약 성공·실패 안내

- Figma: 193:19235 → 215:11686; I215:11744;37:170 → 193:14733. 등록 성공 후 확인 모달을 거쳐 완료된 진료로 복귀한다.
- React: 등록 전 확인 모달을 추가했고 성공 후에는 별도 인라인 결과와 완료 기록으로 링크를 제공한다. 실패도 기존 확인 모달의 오류로 표시한다.
- 근거: [FollowUpPage.tsx:111](../../../frontend/src/features/doctor/FollowUpPage.tsx#L111).
- 제안: 사전 확인의 유지 여부를 결정하고 성공 확인 후 원래 완료 진료로 복귀한다. 기존 Visit·기록을 보존한다.

### D07 · P2 · PARTIAL — 의사 / 기록 정정 화면 구조

- Figma: 130:3477; 193:20311. 좌측에 환자 진료 이력과 버전 탐색, 우측에 정정 폼을 둔다.
- React: 좌측을 현재 최신 기록 본문 비교 영역으로 대체했고 정정 중 이력/버전 탐색이 없다. 정정·충돌·버전 보존 서비스는 존재한다.
- 근거: [RecordWorkspace.tsx:152](../../../frontend/src/features/doctor/RecordWorkspace.tsx#L152).
- 제안: 현재 비교 기능을 보존할지 결정한 후 기존 이력 탐색을 복원한다. 읽기 선택과 정정 기준 버전은 분리한다.

### D09 · P2 · PARTIAL — 의사 / 메뉴의 일정 시작 뷰

- Figma: I193:15580;29:83 → 193:17362; 여러 진료 일정 메뉴 동일. 해당 Prototype 메뉴의 목적지는 일간 일정이다.
- React: 공통 진료 일정 메뉴는 /doctor/schedule 주간으로 이동한다. 주간·일간 자체의 전환 링크는 있다.
- 근거: [navigation.ts:26](../../../frontend/src/components/layout/navigation.ts#L26).
- 제안: 메뉴의 기본 시작 뷰를 확정하고 하나의 경로로 맞춘다. 이전 선택 날짜 및 두 뷰의 URL을 유지한다.

### C01 · P2 · PARTIAL — 공통 / 날짜 선택

- Figma: 193:17528·193:17615·193:17701; 193:26219; 193:6983. 날짜 패널 및 월·연도 선택 상태를 정의한다.
- React: 독립 DatePicker 없이 native input type=date를 사용한다. 날짜 변경은 구현되나 Figma 패널 상태는 없다.
- 근거: [Input.tsx:1](../../../frontend/src/components/ui/Input.tsx#L1).
- 제안: 디자인 승인 후 기존 토큰을 쓰는 공통 날짜 입력을 계획한다. 브라우저별 native 팝업 외형은 이번 검수에서 확인하지 않았다.

### C02 · P2 · PARTIAL — 의사 / 기본 버튼 높이

- Figma: 30:84 진료 완료 h=44; 30:136 변경사항 저장 h=44. 해당 화면의 주요 버튼은 44px 높이다.
- React: doctor 주요 Button은 size 생략으로 기본 min-height 48px를 사용한다. staff/nurse 일부는 compact 또는 영역 CSS로 44px를 적용한다.
- 근거: [ui.css:6](../../../frontend/src/styles/ui.css#L6).
- 제안: 전체 기본값을 바꾸기 전에 해당 화면에서 compact 사용을 검토한다. 인증 화면의 48px 버튼을 함께 변경하지 않는다.

### N01 · P2 · FAIL — 간호사 / 예약 완료·취소 목적지

- Figma: 193:28643 → 193:28592; 193:28644 → 193:25946. 취소는 환자 선택으로, 등록 완료는 접수 환자 목록으로 이동한다.
- React: nurse의 취소와 등록 완료 모두 /nurse/appointments 목록으로 이동한다. 간호사 전용 목록·상세 자체는 API 범위 안에 있다.
- 근거: [AppointmentFormPage.tsx:136](../../../frontend/src/features/appointments/AppointmentFormPage.tsx#L136).
- 제안: Figma와 후속 Phase 4C의 목록 기능을 조율해 취소·완료 기본 목적지를 확정한다. 간호사의 변경/취소 권한을 추가하지 않는다.

### N02 · P2 · PARTIAL — 간호사 / 기록 이력 클릭 대상

- Figma: 193:27718·193:27719 → 193:27729. 기록 시각·본문 요약도 선택할 수 있다.
- React: 시각과 본문은 p이며 별도 기록 보기 Link만 동작한다.
- 근거: [NursingRecordsPage.tsx:258](../../../frontend/src/features/nurse/NursingRecordsPage.tsx#L258).
- 제안: 시각·요약 또는 항목의 의미 있는 선택 영역을 링크로 연결하고 중첩 링크를 피한다.

### N04 · P2 · PARTIAL — 간호사 / 정정 중 버전 탐색

- Figma: 193:27874 → 193:27808; 193:27875 → 193:27832. 정정 폼에서도 원본·1차·최신 버전 선택이 제공된다.
- React: 버전 nav는 correcting 분기의 반대쪽 읽기 전용 분기에만 있다. 정정 중에는 해당 탐색 UI가 없다.
- 근거: [NursingRecordsPage.tsx:303](../../../frontend/src/features/nurse/NursingRecordsPage.tsx#L303).
- 제안: 정정 초안을 유지한 조회 영역을 계획한다. baseVersionNo와 조회 중인 버전 번호를 혼동하지 않는다.

### C03 · P2 · PARTIAL — 공통 / 기록 화면 닫기

- Figma: 243:27016·243:27298 및 반복 Close reactions = BACK. 실제 BACK action으로 이전 화면으로 돌아간다.
- React: 의사 닫기는 /doctor/patients, 간호사 닫기는 /nurse/patients에 고정된다.
- 근거: [ClinicalPage.tsx:231](../../../frontend/src/features/doctor/ClinicalPage.tsx#L231).
- 제안: 허용된 동일 역할 목적지를 전달하고 안전한 기본 목록을 fallback으로 사용한다. 외부 URL은 허용하지 않는다.

### N03 · P3 · FAIL — 간호사 / 예약 목록 메뉴 활성

- Figma: NURSE 공통 사이드바 / 예약 등록. 예약 업무에서 관련 메뉴의 선택 상태를 유지한다.
- React: 예약 메뉴의 to는 /nurse/appointments/new이며 목록·기존 상세에 relatedPaths가 없다. AppLayout의 경로 매칭에서 활성 메뉴가 없다.
- 근거: [navigation.ts:44](../../../frontend/src/components/layout/navigation.ts#L44).
- 제안: /nurse/appointments 관련 범위를 최소 보완한다. 실제 렌더링의 색상·간격은 후속 검증한다.

### C04 · P3 · PARTIAL — 공통 / 닫기 아이콘 자산

- Figma: 243:26858·243:26860. 20px Close 아이콘과 40px 클릭 영역을 사용한다.
- React: 일부 화면은 × 텍스트와 font-size 28px를 사용한다. 클릭 영역·aria-label은 제공한다.
- 근거: [ClinicalPage.tsx:237](../../../frontend/src/features/doctor/ClinicalPage.tsx#L237).
- 제안: 공통 Close 아이콘 재사용을 제안한다. 글리프별 픽셀 차이는 확정하지 않는다.

### D08 · P2 · NOT_IMPLEMENTED — 의사 / 현재 시각 표시

- Figma: 42:1199 / Atom 58:1946. 일간 시간표에 빨간 현재 시각 선과 시각이 있다.
- React: 현재 시각 계산·선·label DOM/CSS가 없다.
- 근거: [DoctorPage.tsx:235](../../../frontend/src/features/doctor/DoctorPage.tsx#L235).
- 제안: 당일 조회에만 표시하는 요소를 기존 시간표에 추가하는 계획을 세운다. 테스트 시간은 고정한다.

## 유지되는 업무 규칙 / 테스트 근거

| 항목 | 실제 코드·검사 | 판정 |
| --- | --- | --- |
| 인증/복귀/역할 제한 | ProtectedRoute.tsx + LoginPage.tsx: 동일 역할 경로만 복귀, 미인증 /login, 타 역할 /403; auth/routes tests | 정적 및 자동 테스트 PASS |
| Mock 운영 차단 | services/mode.ts: DEV 외 mock 요청 throw; auth/service.ts DEV 동적 import, API 오류 fallback 없음 | 정적 및 기존 테스트 PASS |
| 환자 등록·수정 일관성 | PatientForm → refreshPatient, 목록·상세 Query 갱신; staff-flows/staff-integration | 자동 테스트 PASS |
| 예약·접수 연결 | appointments/receptions 중앙 source, 취소 상태·삭제 후 예약 유지·현장접수 예약 미생성 | 기존 service/UI tests PASS; S01은 데이터 손상이 아닌 복귀 UI 차이 |
| 호출·입실 | mock/receptions.ts:425 call, :453 enter; 같은 의사 호출 교체·busy 재검사·Visit 생성 | nurse-service/nurse-ui PASS. 실제 서버 잠금/transaction 미검증 |
| 간호 기록 | mock/nursingRecords.ts: 본인 과+최초 작성자, baseVersionNo 검사, append version | nursing-records / nursing-records-ui PASS |
| 진료 완료·정정 | mock/clinical.ts: assigned doctor, completed guard, immutable originals, version conflict | clinical / clinical-follow-up PASS |
| 재진 예약 | FollowUpPage + clinicalService + 중앙 appointments, 원래 Visit 유지 | clinical-follow-up PASS |
| 계정/캐시 경계 | queryKeys.account/resource, sessionGeneration, AuthProvider.clear, write hooks private cache invalidate | 기존 회귀 테스트 PASS; 다른 사용자 live 동기화는 서버 연동 필요 |

## Figma와 OpenAPI의 관계

**Figma와 OpenAPI 사이 확정 충돌: 0건. React와 명세의 초기값 불일치: S03 1건. 미확정 설계 항목: 2건.** S03은 Figma와 OpenAPI가 모두 요구하는 초기값을 React가 일부만 전달하는 문제이며, 서로 충돌하는 계약으로 집계하지 않았다.

| 분류 | 근거 | 현재 판정 / 권장 방향 |
| --- | --- | --- |
| 미확정 1 / 다른 의사 진료 본문 읽기 | VIS_03은 허용 환자의 다른 의사 이력 요약을 포함(3602행). VIS_05는 DOCTOR 허용 범위(3762행)로 상세 범위가 충분히 구체적이지 않음. Mock record/version은 담당 의사만 허용. | NOT_VERIFIED. 과거 이력 클릭 D02를 고칠 때 권한을 임의 확장하지 말고 상세 읽기 범위를 확정한다. |
| 미확정 2 / 비밀번호 재설정 요청 | AUTH_06/07은 이미 받은 링크 검증/확정. 공개 메일 발송 operation은 없음. ACC_05는 ADMIN 전용. Figma도 관리자 문의 안내. | 공개 API 누락은 현재 구현 오류/충돌 아님. 관리자 문의를 유지하고 후속 계약이 생기기 전 endpoint를 생성하지 않는다. |
| 의도된 계약 보완 / 간호사 예약 | APT_01/02/03 본인 과 허용, 변경/취소는 STAFF만. 간호사 목록·상세는 Figma 대표3상태보다 확장됨. | UI의 nurse 변경/취소 액션 없음, Mock도 거부. N01의 목적지 UX만 조율한다. |
| 계약 우선 / displayStatus | openapi 90~92행: CANCELLED 우선, 유효 접수는 COMPLETED → IN_PROGRESS → CALLED → REGISTERED; 삭제 후 BOOKED | 기존 중앙 Mock을 따른다. 스냅샷의 예시 상태를 근거로 규칙을 바꾸지 않는다. |
| 계약 보완 / 충돌 오류 | REC_05/07 DOCTOR_BUSY, REC_04 삭제 제한, VIS_07/NUR_05 VERSION_CONFLICT | Figma 직접 대응 Frame이 없더라도 API 오류 처리 유지. UI 부재로 단순 실패 처리하지 않음. |
| 미확정 정책 / 진료 필드·개인정보 | ClinicalInput 문자열 required지만 minLength 미정. 원문 주민번호 저장·세션 쿠키/CSRF 서버 정책 미정. | 빈 문자열 또는 Figma 예시 텍스트를 근거로 새 정책을 만들지 않는다. 실제 서버 계약/보관 정책 확정 필요. |

## 자동 테스트가 보장하지 않는 사항

기존 278개는 현 구현 동작과 API/Mock 규칙을 확인한다. 일정에서 환자 진료 이동, 이탈 가드, Figma의 모든 이력 선택·모달 복귀를 통과했다는 근거가 아니다. 이번에는 테스트를 추가·변경하지 않았다. 후속 수정 시 D01~D04/S01 및 N01/N04의 실제 Figma 경로를 회귀 사례로 추가한다.
