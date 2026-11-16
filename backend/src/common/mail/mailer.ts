import nodemailer from 'nodemailer';

export type MailMessage = { to: string; subject: string; text: string };

/** 메일 발송 창구. 테스트에서는 실제로 보내지 않는 가짜 구현으로 바꿔 끼운다. */
export interface Mailer {
  /** SMTP 서버가 발송 요청을 받아들이면 완료된다. 수신함 도착까지 보장하지는 않는다. */
  send(message: MailMessage): Promise<void>;
}

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
};

export function createSmtpMailer(smtp: SmtpSettings, from: string): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user && { auth: { user: smtp.user, pass: smtp.password ?? '' } }),
  });
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

/** SMTP 설정이 없는 로컬 개발 전용. 메일을 보내는 대신 서버 콘솔에 내용을 출력한다. */
export function createConsoleMailer(): Mailer {
  return {
    async send(message) {
      console.log(
        `\n[개발용 메일] 실제로 발송하지 않았습니다.\n받는 사람: ${message.to}\n제목: ${message.subject}\n\n${message.text}\n`,
      );
    },
  };
}
