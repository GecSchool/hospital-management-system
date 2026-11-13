# 06. Phase 5C 검수 요약

검수일: 2026-11-12 KST. 브랜치 `feat/frontend`. **Audit Only**: 코드·CSS·테스트·기존 문서·OpenAPI·Figma는 수정하지 않았다. 판정은 정적 코드와 실제 Figma 데이터의 대조이며 실행 화면의 픽셀 일치를 뜻하지 않는다.

**전수 구조·연결 수집과 정적 대조 보고서를 작성했다. 모든 Frame의 디자인 적합성 및 모든 연결의 구현 일치가 검증 완료된 것은 아니다.** Figma 호출 한도와 실행 검증 제한으로 남은 범위는 NOT_VERIFIED로 분리했다.

## 집계 기준

| 항목 | 결과 | 분모 / 의미 |
| --- | --- | --- |
| 전체 대상 Frame | 408 | 업무 Screens34 + Prototype373 + 공통 Foundation1. 관리자/보관/내부 Frame 제외 |
| 실제 구조·메타데이터 확인 | 408 / 408 (100%) | Frame 이름·ID·소속 구조. 외형/구현 PASS 비율과 다름 |
| design_context 확보 | 66 / 408 (16.18%) | Screens34 + Prototype32. 그 외 상태와 Foundation context 미확보 |
| Figma 기준 이미지 확인 | 41 | Screens34 + 주요 상태7. 실앱 이미지 없음 |
| Prototype 업무 Flow | 18 섹션 / 실제 시작점12 | 섹션 수와 flowStartingPoints 수를 구분 |
| 실제 확인 연결 | 3,500 / 3,500 (100%) | 열거된373 Prototype Frame의 reaction/action. 숨김580 포함 |
| 표시노드 연결의 정적 대조 | 2890 / 2,920 (98.97%) | visible=true 기준. 실제 occlusion/클릭 가능 여부 미검증. 나머지는 NOT_VERIFIED |
| 대조 확정 연결 중 완전 일치 | 1515 / 2890 (52.42%) | 부분 일치를 PASS에 합산하지 않음. 전체 활성 연결 대비 비율은 51.88% |
| Figma와 OpenAPI 상충 | 0 | React의 PAT_07 초기값 누락 S03 1건은 별도. 미확정 설계2 |
| 테스트 | 278 / 278, 19 files 통과 | 기존 Vitest 기준선. Figma 적합성의 증명 아님 |
| TypeScript | 통과 | npm run typecheck --workspace frontend |
| 프로덕션 빌드 | 통과 | npm run build --workspace frontend; 214 modules, Vite8.3.7 |
| 브라우저·393px·픽셀 차이 | NOT_VERIFIED | 요청에 따라 실행하지 않음 |

## 판정 집계

동일한 Frame과 그 안의 많은 reaction을 합산해 하나의 합격률로 만들지 않는다. Frame 판정은 정적 대응 상태이며, reaction 판정은 02의 행별 코드 대조다.

| 판정 | Frame 408개 | reaction 3,500개 |
| --- | --- | --- |
| PASS | 28 | 1515 |
| PARTIAL | 159 | 883 |
| FAIL | 0 | 6 |
| NOT_IMPLEMENTED | 3 | 486 |
| NOT_VERIFIED | 218 | 30 |
| N/A | 0 | 580 |

## 문제 우선순위

| 우선순위 | 서로 다른 문제 수 | 항목 |
| --- | --- | --- |
| P0 | 0 | 확인된 문제 없음 |
| P1 | 7 | D01 의사 / 입실 전 환자 기록 조회; D02 의사 / 과거 진료 선택; D03 의사 / 일정에서 환자 선택; D04 의사 / 미저장 진료 이탈; S01 직원 / 예약 취소 완료 복귀; S02 직원 / 현장 접수 완료 복귀; S03 직원 / 재진 예약 초기값 |
| P2 | 12 | S04 직원 / 예약일 이전 접수 제한 안내; D05 의사 / 진료 시간 저장 피드백; D06 의사 / 재진 예약 성공·실패 안내; D07 의사 / 기록 정정 화면 구조; D09 의사 / 메뉴의 일정 시작 뷰; C01 공통 / 날짜 선택; C02 의사 / 기본 버튼 높이; N01 간호사 / 예약 완료·취소 목적지; N02 간호사 / 기록 이력 클릭 대상; N04 간호사 / 정정 중 버전 탐색; C03 공통 / 기록 화면 닫기; D08 의사 / 현재 시각 표시 |
| P3 | 2 | N03 간호사 / 예약 목록 메뉴 활성; C04 공통 / 닫기 아이콘 자산 |

- **STAFF:** S01 예약 취소 후 패널이 남고, S02 현장 접수 완료 후 환자 상세에 머문다. S03 이력에서 재진 예약 시 과·의사 초기값이 빠진다. S04 예약일 이전 제한은 클릭 후 안내 대신 disabled로 제공한다. 환자·예약·접수 데이터 보존은 기존 테스트 통과. 대시보드의 예약 등록/현장 접수 → 환자 목록은 실제 Figma 연결과 일치한다.
- **NURSE:** N01 예약 완료·취소 목적지, N02 이력 시각/요약 클릭, N04 정정 중 버전 탐색, N03 예약 목록 메뉴 활성. 호출 교체·입실·기록 버전/작성자 제한·간호사 예약 변경/취소 금지는 기존 코드·테스트에서 확인했다.
- **DOCTOR:** D01 입실 전 이력, D02 과거 이력 선택, D03 일정 진료 이동/다중 환자, D04 미저장 이탈이 우선이다. D05/D06 피드백 모달, D07 정정 구조, D08 현재 시각 표시, D09 일정 메뉴 기본 뷰도 차이가 있다.
- **AUTH/공통:** 이메일/Mock 아이디 구분과 로고 20px는 의도된 차이다. native DatePicker, 의사 기본 버튼 높이, BACK/닫기 구현 및 Close 글리프 차이는 별도 기록했다.

## 미검증·제약

- Figma MCP가 Education plan tool call limit 오류를 실제 반환했다. 인증 실패나 연결 부재로 판정하지 않는다. 오류 원문과 확보된 context는 evidence.json에 보존했다. 추가 조회는 중단했다.
- 전체 Prototype 구조·reaction은 오류 발생 전에 수집했다. 모든 수집 edge를 구현 PASS로 간주하지 않았고, 대응 경로를 확정하지 못한 30개는 NOT_VERIFIED다.
- 로그인 시작 Frame 성공/실패 이동 및 휴진 확인 버튼 등 Figma 자체에 reaction이 없는 단계도 미검증이다. 이름·위치로 연결을 채우지 않았다.
- 실제 데스크톱/393px·폰트 렌더링·레이아웃 겹침·native 팝업·포커스·터치 영역·픽셀 차이는 검증하지 않았다.
- 실제 API endpoint 연결, 서버 권한·세션/CSRF·동시성/transaction·다중 사용자 동기화는 서버 연동 후 확인해야 한다. VIS_05 상세 읽기 범위와 공개 재설정 요청 계약은 미확정 항목이다.

## 산출물과 다음 단계

1. [화면 목록](01-screen-inventory.md)
2. [실제 연결 전수 표](02-prototype-flow-audit.md)
3. [UI 차이](03-ui-design-audit.md)
4. [기능·계약 차이](04-functional-gaps.md)
5. [수정 계획](05-fix-plan.md)
6. 이 요약 및 원시 근거 evidence.json / reaction-assessments.json / context-retry.json

확인된 P1부터 별도 수정 Phase 착수는 가능하다. 전체 Figma 일치 검수 완료 선언이나 Phase 6 진행 승인은 아니다. 이번 작업은 검수 문서 생성까지만 수행했으며 실제 수정·다음 Phase를 실행하지 않는다.

## 파일 보존 확인

작업 전 원본 파일 143개의 SHA-256과 최종 상태를 비교해 변경·삭제 0건을 확인했다. 검수 폴더 밖 새 소스·문서 파일도 0건이다. 기존 사용자 변경사항을 보존했다. 집계 합계, reaction 고유 키 3,500개, 문서의 로컬 파일 링크도 확인했다. 상세 결과는 [verification.json](verification.json)에 기록했다.
