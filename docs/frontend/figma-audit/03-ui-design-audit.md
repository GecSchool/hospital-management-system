# 03. UI·디자인 정적 검수

검수일: 2026-11-12 KST. 브랜치 `feat/frontend`. **Audit Only**: 코드·CSS·테스트·기존 문서·OpenAPI·Figma는 수정하지 않았다. 판정은 정적 코드와 실제 Figma 데이터의 대조이며 실행 화면의 픽셀 일치를 뜻하지 않는다.

## 기준 확보 범위

Screens 34개는 design_context와 Figma 기준 이미지를 모두 조회·확인했다. Prototype은 보존된 context 32개를 추가 확보했다. 상태 전체의 context 조회 중 Education 플랜 MCP 호출 한도가 반환되어, 확보하지 못한 상태 외형은 NOT_VERIFIED다. 캡처는 Figma 기준 화면뿐이며 개발 서버·Chrome·393px 화면은 캡처하지 않았다.

| 영역 | Figma 기준 | React 근거 | 판정과 한계 |
| --- | --- | --- | --- |
| 공통 레이아웃 | 240px 사이드바, 72px topbar, 본문 x=288 | layout.css: grid 240px, 좌우48px, header92px | 로고 20px 추가에 따른 92px는 의도된 차이. 화면 픽셀 일치는 미검증 |
| 아이덴티티 | 84×36 심벌, 16px 그룹 간격 | HospitalIdentity + layout.css 동일 규격; padding-top42px vs 원본22px | 의도된 +20px 유지. 메뉴·하단 실제 겹침은 브라우저 미검증 |
| 색상·폰트 | primary #026894, subtle #e5f3f8, text #172b3a, secondary #526576, Noto Sans KR | tokens.css/base.css 로컬 폰트와 일치 | 조회한 Screens 값의 정적 대조 PASS. Foundation 전체 토큰 시각 검수 아님 |
| 직원 목록·상세 | 검색4조건, 목록5행, 3이력 탭, 등록/수정/현장접수 Modal | PatientList/PatientDetail/PatientHistory/PatientForm 및 staff.css | 기본 구조 재사용. 예약 취소 복귀는 S01, DatePicker C01 |
| 직원 예약 상세 | 420px 직사각 패널, dimmed backdrop, 3업무 버튼 | appointment-panel CSS와 native Modal, eligibility 조건 | Figma는 여러 상태를 NAVIGATE로 합성; React는 실제 Modal 상태. 처리 시점은 02에 분리 |
| 간호사 접수 | 소속 과, 날짜, 이름/생년월일/의사 검색, 전체·접수 완료 탭 | NursePage + nurse.css | 요청/필터 구조 확인. native 날짜 패널·상세 닫기 차이 |
| 간호 기록 | 좌측 이력, 우측 작성/조회, 본인 정정, 다른 작성자 읽기 전용 | NursingRecordsPage + records.css | 쓰기/조회/권한 구조 존재. N02/N04 클릭과 편집 중 버전 차이 |
| 의사 일간 일정 | 좌측 오늘 시간표, 우측 오늘 예약/내원, 현재 시각 표시 | DoctorPage + doctor.css / schedule table·lists | 환자 이동 D03 누락. 현재 시각 Indicator 58:1946 대응 DOM 없음; 별도 후속 UI 항목 |
| 의사 진료·정정 | 410px 이력 + 500px 본문, 64px 간격 | clinical.css 동일 column 수치; RecordWorkspace의 좌측 구성 변경 | 진료 기본 칼럼 수치는 일치. 정정 구성 D07, 이력 선택 D02 불일치 |
| 반응형 | 조회한 업무 Screens는 주로 1440px 데스크톱 | staff/nurse/doctor scope의 900px 이하 min-width:0, 메뉴·column 재배치, 테이블 overflow-x:auto | CSS 분기 존재만 확인. 393px 가로 넘침·터치·모달 가시성 NOT_VERIFIED |

## 확인된 차이와 권장 조치

| 이슈 / 우선순위 | 화면 | Figma | React와 차이 | 근거 | 권장 조치 |
| --- | --- | --- | --- | --- | --- |
| S04 / P2 | 직원 / 예약일 이전 접수 제한 안내 | 예약일 이전 상세에서 접수 버튼을 누르면 제한 안내 상태 Frame으로 이동한다. | receptionEligibility가 있으면 버튼 disabled와 설명 문구로 제한해 클릭 후 안내 상태로 이동하지 않는다. 당일 접수 제한 업무 규칙은 유지한다. | [AppointmentListPage.tsx:376](../../../frontend/src/features/appointments/AppointmentListPage.tsx#L376) | 제한 UX를 비활성 안내로 유지할지 클릭 후 설명 상태로 맞출지 결정한다. REC_01의 예약일 당일 제한을 풀지 않는다. 추가 상태 Frame 외형은 미검증이다. |
| D05 / P2 | 의사 / 진료 시간 저장 피드백 | 저장 성공 및 미래 예약 충돌을 확인 대화상자로 표시한다. | 성공은 setNotice, 충돌은 write.error 인라인 안내다. 저장·충돌 업무 규칙은 구현되어 있다. | [DoctorPage.tsx:175](../../../frontend/src/features/doctor/DoctorPage.tsx#L175) | 공통 Modal로 표시 방식과 확인 후 편집 복귀를 맞춘다. 저장 전 확인이 Figma에 있다고 추정하지 않는다. |
| D06 / P2 | 의사 / 재진 예약 성공·실패 안내 | 등록 성공 후 확인 모달을 거쳐 완료된 진료로 복귀한다. | 등록 전 확인 모달을 추가했고 성공 후에는 별도 인라인 결과와 완료 기록으로 링크를 제공한다. 실패도 기존 확인 모달의 오류로 표시한다. | [FollowUpPage.tsx:111](../../../frontend/src/features/doctor/FollowUpPage.tsx#L111) | 사전 확인의 유지 여부를 결정하고 성공 확인 후 원래 완료 진료로 복귀한다. 기존 Visit·기록을 보존한다. |
| D07 / P2 | 의사 / 기록 정정 화면 구조 | 좌측에 환자 진료 이력과 버전 탐색, 우측에 정정 폼을 둔다. | 좌측을 현재 최신 기록 본문 비교 영역으로 대체했고 정정 중 이력/버전 탐색이 없다. 정정·충돌·버전 보존 서비스는 존재한다. | [RecordWorkspace.tsx:152](../../../frontend/src/features/doctor/RecordWorkspace.tsx#L152) | 현재 비교 기능을 보존할지 결정한 후 기존 이력 탐색을 복원한다. 읽기 선택과 정정 기준 버전은 분리한다. |
| D09 / P2 | 의사 / 메뉴의 일정 시작 뷰 | 해당 Prototype 메뉴의 목적지는 일간 일정이다. | 공통 진료 일정 메뉴는 /doctor/schedule 주간으로 이동한다. 주간·일간 자체의 전환 링크는 있다. | [navigation.ts:26](../../../frontend/src/components/layout/navigation.ts#L26) | 메뉴의 기본 시작 뷰를 확정하고 하나의 경로로 맞춘다. 이전 선택 날짜 및 두 뷰의 URL을 유지한다. |
| C01 / P2 | 공통 / 날짜 선택 | 날짜 패널 및 월·연도 선택 상태를 정의한다. | 독립 DatePicker 없이 native input type=date를 사용한다. 날짜 변경은 구현되나 Figma 패널 상태는 없다. | [Input.tsx:1](../../../frontend/src/components/ui/Input.tsx#L1) | 디자인 승인 후 기존 토큰을 쓰는 공통 날짜 입력을 계획한다. 브라우저별 native 팝업 외형은 이번 검수에서 확인하지 않았다. |
| C02 / P2 | 의사 / 기본 버튼 높이 | 해당 화면의 주요 버튼은 44px 높이다. | doctor 주요 Button은 size 생략으로 기본 min-height 48px를 사용한다. staff/nurse 일부는 compact 또는 영역 CSS로 44px를 적용한다. | [ui.css:6](../../../frontend/src/styles/ui.css#L6) | 전체 기본값을 바꾸기 전에 해당 화면에서 compact 사용을 검토한다. 인증 화면의 48px 버튼을 함께 변경하지 않는다. |
| N01 / P2 | 간호사 / 예약 완료·취소 목적지 | 취소는 환자 선택으로, 등록 완료는 접수 환자 목록으로 이동한다. | nurse의 취소와 등록 완료 모두 /nurse/appointments 목록으로 이동한다. 간호사 전용 목록·상세 자체는 API 범위 안에 있다. | [AppointmentFormPage.tsx:136](../../../frontend/src/features/appointments/AppointmentFormPage.tsx#L136) | Figma와 후속 Phase 4C의 목록 기능을 조율해 취소·완료 기본 목적지를 확정한다. 간호사의 변경/취소 권한을 추가하지 않는다. |
| N02 / P2 | 간호사 / 기록 이력 클릭 대상 | 기록 시각·본문 요약도 선택할 수 있다. | 시각과 본문은 p이며 별도 기록 보기 Link만 동작한다. | [NursingRecordsPage.tsx:258](../../../frontend/src/features/nurse/NursingRecordsPage.tsx#L258) | 시각·요약 또는 항목의 의미 있는 선택 영역을 링크로 연결하고 중첩 링크를 피한다. |
| N04 / P2 | 간호사 / 정정 중 버전 탐색 | 정정 폼에서도 원본·1차·최신 버전 선택이 제공된다. | 버전 nav는 correcting 분기의 반대쪽 읽기 전용 분기에만 있다. 정정 중에는 해당 탐색 UI가 없다. | [NursingRecordsPage.tsx:303](../../../frontend/src/features/nurse/NursingRecordsPage.tsx#L303) | 정정 초안을 유지한 조회 영역을 계획한다. baseVersionNo와 조회 중인 버전 번호를 혼동하지 않는다. |
| C03 / P2 | 공통 / 기록 화면 닫기 | 실제 BACK action으로 이전 화면으로 돌아간다. | 의사 닫기는 /doctor/patients, 간호사 닫기는 /nurse/patients에 고정된다. | [ClinicalPage.tsx:231](../../../frontend/src/features/doctor/ClinicalPage.tsx#L231) | 허용된 동일 역할 목적지를 전달하고 안전한 기본 목록을 fallback으로 사용한다. 외부 URL은 허용하지 않는다. |
| N03 / P3 | 간호사 / 예약 목록 메뉴 활성 | 예약 업무에서 관련 메뉴의 선택 상태를 유지한다. | 예약 메뉴의 to는 /nurse/appointments/new이며 목록·기존 상세에 relatedPaths가 없다. AppLayout의 경로 매칭에서 활성 메뉴가 없다. | [navigation.ts:44](../../../frontend/src/components/layout/navigation.ts#L44) | /nurse/appointments 관련 범위를 최소 보완한다. 실제 렌더링의 색상·간격은 후속 검증한다. |
| C04 / P3 | 공통 / 닫기 아이콘 자산 | 20px Close 아이콘과 40px 클릭 영역을 사용한다. | 일부 화면은 × 텍스트와 font-size 28px를 사용한다. 클릭 영역·aria-label은 제공한다. | [ClinicalPage.tsx:237](../../../frontend/src/features/doctor/ClinicalPage.tsx#L237) | 공통 Close 아이콘 재사용을 제안한다. 글리프별 픽셀 차이는 확정하지 않는다. |

현재 시각 표시 누락은 P2 **D08**로 별도 집계한다. Figma 42:1199에 빨간 선과 시각이 있고 Components 58:1946이 존재한다. DoctorPage.tsx/doctor.css에는 현재 시각 계산·표시 요소가 없다. 실제 위치 오차가 아니라 요소 존재 여부의 정적 차이다.

## 상태별 공통 컴포넌트 검토

| 컴포넌트 | 실제 Figma 정의 | React 상태 | 판정 |
| --- | --- | --- | --- |
| Button | Primary/Secondary Default·Disabled; 조회한 Set에는 독립 Hover variant 없음 | hover CSS, disabled, busy label; default48/compact44 | C02. Hover variant 미존재를 임의 실패로 분류하지 않음 |
| Input/Select | Default/Error; Search segment Focus; Underline field Default/Focus/Error | FormField error, aria-invalid, focus border, native select | 기본 구조 PARTIAL; Select popup은 native로 외형 미검증 |
| Modal | 확인/성공/오류 합성 Frame, 12px radius, overlay | controlled native dialog, Esc → onClose; mutation pending guard는 호출자 책임 | 기본 규격 확인. 모달 시점 차이는 S01/D05/D06. 포커스 복귀 실브라우저 미검증 |
| Table | 도메인별 열·테두리·텍스트 상태 | 공통 Table render column, 가로 스크롤 | 도메인 열 확인. 실제 행 높이·폰트 줄바꿈 미검증 |
| Pagination | 249:378과 Default/Selected/Disabled item; 페이지별 추가 Frame | 최대5번호, 이전/다음, onPageChange | 정적 선택/페이지 변경 PASS. 데이터량은 Figma 예시 숫자와 동일할 필요 없음 |
| Tab | Active/Default | controlled Tab 또는 업무 nav, selected border, 키보드 대응 | 직원/간호사 기본 분기 확인. 렌더링 색상 미검증 |
| Badge/Status | 주로 텍스트 상태 | Badge는 text-first, role별 displayStatus 라벨 | 임의 pill 추가 없음. API 합성 상태를 우선함 |
| DatePicker | 월/연도/일 전환 상태 존재 | native date만 사용 | C01 PARTIAL |
| Loading/Empty/Error | 모든 업무의 모든 상태 Frame이 존재하지는 않음 | 공통 States 및 query Pending/Error/emptyMessage/retry | API상 필요한 보완 상태. Figma에 없다는 이유로 오류 처리 삭제 제안 안 함 |
| Success/Confirmation/Conflict | 업무별로 실제 Frame이 있는 경우만 비교 | notice/Modal 및 VERSION_CONFLICT 재조회 | 정의된 상태 D05/D06 등만 차이 집계. 미정의 API 오류 UI는 N/A |

## 의도된 환경 차이

- 개발 Mock: 아이디 staff/doctor/nurse/admin + 1234. 운영 API: email/password. LoginPage와 apiAuthService 분리, services/mode.ts의 DEV 차단 유지. Figma 이메일 입력과 Mock 아이디 입력은 오류가 아니다.
- 로고 그룹 위 20px 추가와 관련 92px 헤더는 기존 승인 요구다. 72px로 되돌리는 수정은 제안하지 않는다.
- Mock 시나리오 컨트롤·추가 서버 오류·권한 안내는 개발/계약 지원 요소다. Figma에 가상 계정 값이 없다는 이유로 불일치 건수를 늘리지 않는다.
