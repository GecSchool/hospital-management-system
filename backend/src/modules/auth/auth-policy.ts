// 인증 흐름에서 쓰는 시간·횟수 기준을 한곳에 모아 둔다. 값을 바꾸면 docs/auth-design.md도 함께 고친다.

/** 마지막 요청 이후 이 시간이 지나면 세션이 만료된다. 요청할 때마다 다시 연장된다. */
export const SESSION_IDLE_MS = 60 * 60 * 1000; // 1시간
/** 계속 사용하더라도 로그인한 지 이 시간이 지나면 다시 로그인해야 한다. */
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12시간
export const SESSION_COOKIE_NAME = 'connect.sid';

/** 초대 링크 유효 시간. 메일을 바로 확인하지 못하는 경우를 고려한다. */
export const INVITATION_TTL_SECONDS = 72 * 60 * 60; // 72시간
/** 비밀번호 재설정 링크 유효 시간. 기존 계정을 바꾸는 링크이므로 짧게 둔다. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1시간

/** 로그인 실패 횟수 제한. 성공한 요청은 세지 않는다. */
export const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10분
export const LOGIN_FAILURE_LIMIT_PER_EMAIL = 5; // 같은 IP·같은 이메일
export const LOGIN_FAILURE_LIMIT_PER_IP = 30; // 같은 IP 전체
/** 링크 검증·수락처럼 로그인 없이 호출하는 API의 요청 수 제한. */
export const PUBLIC_TOKEN_WINDOW_MS = 60 * 1000; // 1분
export const PUBLIC_TOKEN_LIMIT_PER_IP = 30;

/** 새 비밀번호 규칙: 영문과 숫자를 각각 1자 이상 포함한 8~128자. 특수문자는 넣어도 되고 안 넣어도 된다. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
