// AUTH-06~07, ACC-05 비밀번호 초기화의 입력 검사.
// 요청 본문의 토큰·비밀번호는 초대 수락과 같은 규칙을 쓰므로 공통 검사를 그대로 내보낸다.
export { parsePasswordSubmission, parseTokenBody } from './password-submission.validation.js';
export { parseAccountId } from '../../account/validations/account-query.validation.js';
