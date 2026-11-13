# 05. 수정 계획 — 실행하지 않음

검수일: 2026-11-12 KST. 브랜치 `feat/frontend`. **Audit Only**: 코드·CSS·테스트·기존 문서·OpenAPI·Figma는 수정하지 않았다. 판정은 정적 코드와 실제 Figma 데이터의 대조이며 실행 화면의 픽셀 일치를 뜻하지 않는다.

검수 단계에서는 아래 제안만 작성했다. 승인된 수정 Phase에서 항목별 구현과 테스트를 수행한다. 다음 Phase/관리자 기능을 시작하지 않는다. 모델은 프로젝트에서 사용한 **GPT-6.1 Sol Medium**을 기본 구현 담당으로 제안한다. 복잡한 상태·권한 변경은 별도 검토 턴에서 검토하고, 자동 모델 변경이나 하위 에이전트 실행은 하지 않았다.

| 순서 | 배치 / 이슈 | 예상 변경 범위 | 완료 기준 | 공통 영향 / 권장 검토 |
| --- | --- | --- | --- | --- |
| 0 | P0 / 현재 0건 | 새 증거가 생긴 경우에만 재분류 | 확인되지 않은 위험을 코드 변경 근거로 사용하지 않음 | — |
| 1 | P1-A / D01·D02 | ClinicalPage, clinicalService 읽기 경계, 최소 patient history route/state, 관련 tests | 입실 전 이력 조회; 이전 기록 선택; Visit 생성 금지; 현재 초안/선택 맥락 보존 | 의사 전용으로 한정. VIS_05 범위 미확정 부분은 별도 결정. Sol Medium + 독립 권한 검토 |
| 2 | P1-B / D03 | DoctorPage, schedule row/slot link 및 선택 패널, 기존 IDs 사용 | 주간/일간/동일 슬롯 다중 환자에서 올바른 진료·기록 진입 | 환자/예약/접수/Visit을 재생성하지 않음. Sol Medium |
| 3 | P1-C / D04 | ClinicalPage draft/dirty 상태와 AppLayout 메뉴 이탈 연계 최소 변경 | 계속 작성 유지, 나가기 이동, sidebar/close 경계 회귀; 저장 완료 후 가드 해제 | 공통 AppLayout 변경은 STAFF/NURSE/ADMIN 메뉴 회귀 필요. Sol Medium + 상태 전환 검토 |
| 4 | P1-D / S01·S02·S03 | AppointmentListPage/PatientDetail 성공 callback, PatientHistory 초기값 전달, AppointmentForm 수신, 기존 tests | 예약 취소·현장 접수 성공 목록 복귀; 이력의 환자·과·의사 초기값; 실패 시 원래 상태 유지 | 검색 조건·page, cancelled·원래 Visit 보존. 과/의사 활성·소속 재검사. Modal 공통 구현 변경 불필요. Sol Medium |
| 5 | P2-A / D05·D06·D09 | DoctorPage/FollowUpPage 상태별 Modal, 메시지·복귀 시점, 메뉴 기본 일정 뷰 | 성공/충돌 모달 확인·닫기·실패 재시도, 저장 요청은 확정 단계 1회, 일정 기본 뷰 일치 | Modal 접근성·Esc·pending, 날짜 query 유지. Sol Medium |
| 6 | P2-B / D07·N04 | RecordWorkspace/NursingRecordsPage 편집 중 history/version 조회 | 조회 버전과 baseVersionNo 분리, 초안 유지, conflict 재조회 후 명시적 재시도 | 공통 record 조회 패널 추출은 필요할 때 최소. 대규모 리팩터링 금지. Sol Medium |
| 7 | P2-C / N01·N02·C03 | 예약 폼 종료 정책, 기록 선택 Link, 허용된 returnTo 전달 | Figma 취소/완료 목적지 합의, 시각/요약 클릭, 안전한 이전 맥락 복귀 | NURSE 예약 목록 API 기능 제거·권한 확장 금지. Sol Medium |
| 8 | P2-D / C01·C02·D08 | 공통 날짜 입력 계획, 의사 compact 버튼, 일간 현재 시각 표시 | 달력 상태 기준 합의·키보드/date 경계·고정 시간 테스트·당일만 선 표시 | DatePicker는 AUTH/STAFF/NURSE/DOCTOR 영향. native 대체 승인 전 구현하지 않음. 기본 Button 일괄 변경 피함. Sol Medium |
| 9 | P3 / N03·C04 | navigation.relatedPaths, 공통 Close 자산 | 목록/상세 활성 메뉴, 닫기 접근성·클릭영역 보존 | 모든 역할 메뉴 및 Modal/헤더 회귀. Sol Medium |
| 10 | 재검수 / context·브라우저 미검증 | Figma 호출 한도 회복 후 나머지 context, 별도 허용된 브라우저 세션 | 미검증 Frame/edge 재대조, 데스크톱·393px·focus·overflow | 이번 요청에서는 Chrome·실앱 캡처·픽셀 diff 금지이므로 수행하지 않음 |

S04의 예약일 이전 제한 안내는 P2-A의 상태 피드백 정리와 함께 조율한다. 현재 disabled 제한을 제거해 업무상 접수를 허용하는 수정은 하지 않는다.

## 수정 시 유지할 조건

1. dev 계정 4종/1234, 운영 Mock 차단, 기존 인증·역할 제한 유지.
2. 로고 위 20px 유지. Figma 72px topbar로 단순 회귀시키지 않음.
3. backend/OpenAPI/Figma/Workspaces/타 역할 상세 업무 수정 금지.
4. 새 UI 상태가 필요해도 임의 endpoint·저장 정책·권한을 만들지 않음.
5. 기존 278개에 근거 있는 회귀 테스트를 추가하고 TypeScript·production build를 실행.
6. Git commit/push/merge 및 다음 Phase 자동 실행 금지.
