import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface PassTicketEmailData {
  to: string;
  visitorName: string;
  passNumber: string;
  visitDate: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  businessCenterName?: string;
  office: string;
  floor?: string;
  companyName?: string;
  visitPurpose?: string;
  ticketUrl: string;
}

const PASS_FROM_DISPLAY_NAME = 'Пропуск.М-Стиль';

/**
 * SMTP (Nodemailer): билеты, OTP регистрации, сброс пароля, verify email.
 * Без SMTP_HOST — isConfigured()=false, send* бросают BadRequest.
 * В Docker dev письма смотреть в Mailpit :8025.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  isConfigured(): boolean {
    return !!this.transporter;
  }

  async sendPassTicket(data: PassTicketEmailData) {
    if (!this.transporter) {
      throw new BadRequestException(
        'Почтовый сервер не настроен. Укажите SMTP_HOST, SMTP_PORT и SMTP_FROM в настройках сервера.',
      );
    }

    const from = this.getPassFromAddress();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.ticketUrl)}`;
    const visitTime = data.visitTimeFrom
      ? `${data.visitTimeFrom}${data.visitTimeTo ? `–${data.visitTimeTo}` : ''}`
      : '';
    const officeLine = `оф. ${data.office}${data.floor ? `, ${data.floor} эт.` : ''}`;

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <div style="background:#0f2b4a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <div style="font-size:18px;font-weight:700">${data.businessCenterName || 'M-STYLE'}</div>
          <div style="font-size:13px;opacity:.85;margin-top:4px">Электронный пропуск</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px;background:#fff">
          <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
            Подойдите на стойку охраны и скажите своё ФИО или покажите QR-код.
          </p>
          <div style="text-align:center;margin:0 0 20px">
            <img src="${qrUrl}" alt="QR-код пропуска" width="220" height="220" style="border:1px solid #e2e8f0;border-radius:12px" />
          </div>
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:22px;font-weight:700">${data.visitorName}</div>
            <div style="font-family:monospace;color:#64748b;margin-top:6px">${data.passNumber}</div>
          </div>
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            ${data.companyName ? `<tr><td style="color:#64748b;padding:6px 0">Компания</td><td style="text-align:right;padding:6px 0">${data.companyName}</td></tr>` : ''}
            <tr><td style="color:#64748b;padding:6px 0">Дата визита</td><td style="text-align:right;padding:6px 0">${data.visitDate}${visitTime ? ` · ${visitTime}` : ''}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Офис</td><td style="text-align:right;padding:6px 0">${officeLine}</td></tr>
            ${data.visitPurpose ? `<tr><td style="color:#64748b;padding:6px 0">Цель</td><td style="text-align:right;padding:6px 0">${data.visitPurpose}</td></tr>` : ''}
          </table>
          <div style="text-align:center;margin-top:24px">
            <a href="${data.ticketUrl}" style="display:inline-block;background:#0f2b4a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
              Открыть пропуск
            </a>
          </div>
          <p style="font-size:12px;color:#64748b;margin:20px 0 0;text-align:center">
            Ссылка постоянная: <a href="${data.ticketUrl}">${data.ticketUrl}</a>
          </p>
        </div>
      </div>
    `;

    const text = [
      `${data.businessCenterName || 'M-STYLE'} — электронный пропуск`,
      '',
      'Подойдите на стойку охраны и скажите своё ФИО или покажите QR-код.',
      '',
      `Посетитель: ${data.visitorName}`,
      `Номер: ${data.passNumber}`,
      `Дата: ${data.visitDate}${visitTime ? ` ${visitTime}` : ''}`,
      `Офис: ${officeLine}`,
      '',
      `Открыть пропуск: ${data.ticketUrl}`,
    ].join('\n');

    try {
      const info = await this.transporter.sendMail({
        from,
        to: data.to,
        subject: `Пропуск ${data.passNumber} — ${data.visitorName}`,
        text,
        html,
      });

      this.logger.log(
        `Pass ticket emailed to ${data.to} (${data.passNumber}): ${info.messageId || 'ok'} ${info.response || ''}`.trim(),
      );
      return { sent: true, to: data.to, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка SMTP';
      const response = (err as { response?: string }).response;
      this.logger.error(`SMTP send failed to ${data.to}: ${message}${response ? ` | ${response}` : ''}`);
      throw new InternalServerErrorException(
        response ? `Почтовый сервер отклонил отправку: ${response}` : `Не удалось отправить письмо: ${message}`,
      );
    }
  }

  async sendRegistrationCode(to: string, code: string) {
    if (!this.transporter) {
      throw new BadRequestException(
        'Почтовый сервер не настроен. Регистрация по email временно недоступна.',
      );
    }

    const from = this.getPassFromAddress();
    const appHost = this.getAppHost();
    const html = this.buildCodeEmailHtml({
      title: 'Подтверждение регистрации',
      intro: `Введите этот код на странице регистрации ${appHost}:`,
      code,
      footer: 'Код действует 15 минут. Если вы не запрашивали регистрацию, просто проигнорируйте письмо.',
    });

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Код подтверждения: ${code}`,
        text: `Код подтверждения регистрации на ${appHost}: ${code}\nКод действует 15 минут.`,
        html,
      });
      this.logger.log(`Registration code emailed to ${to}`);
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка SMTP';
      this.logger.error(`Registration code email failed to ${to}: ${message}`);
      throw new InternalServerErrorException('Не удалось отправить код подтверждения на почту');
    }
  }

  async sendPasswordResetCode(to: string, code: string) {
    if (!this.transporter) {
      throw new BadRequestException(
        'Почтовый сервер не настроен. Восстановление пароля временно недоступно — обратитесь к администратору.',
      );
    }

    const from = this.getPassFromAddress();
    const appHost = this.getAppHost();
    const html = this.buildCodeEmailHtml({
      title: 'Восстановление пароля',
      intro: `Введите этот код на странице входа ${appHost}, чтобы задать новый пароль:`,
      code,
      footer: 'Код действует 15 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.',
    });

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Восстановление пароля: ${code}`,
        text: `Код восстановления пароля на ${appHost}: ${code}\nКод действует 15 минут.`,
        html,
      });
      this.logger.log(`Password reset code emailed to ${to}`);
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка SMTP';
      this.logger.error(`Password reset email failed to ${to}: ${message}`);
      throw new InternalServerErrorException('Не удалось отправить код восстановления на почту');
    }
  }

  async sendEmailVerificationCode(to: string, code: string) {
    if (!this.transporter) {
      throw new BadRequestException(
        'Почтовый сервер не настроен. Подтверждение email временно недоступно.',
      );
    }

    const from = this.getPassFromAddress();
    const appHost = this.getAppHost();
    const html = this.buildCodeEmailHtml({
      title: 'Подтверждение email',
      intro: `Введите этот код в профиле на ${appHost}, чтобы подтвердить адрес почты:`,
      code,
      footer: 'Код действует 15 минут. Если вы не запрашивали подтверждение, просто проигнорируйте письмо.',
    });

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Подтверждение email: ${code}`,
        text: `Код подтверждения email на ${appHost}: ${code}\nКод действует 15 минут.`,
        html,
      });
      this.logger.log(`Email verification code emailed to ${to}`);
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка SMTP';
      this.logger.error(`Email verification email failed to ${to}: ${message}`);
      throw new InternalServerErrorException('Не удалось отправить код подтверждения на почту');
    }
  }

  /**
   * Приглашение сотрудника: ссылка на /invite/{token}, TTL 72 ч.
   * PUBLIC_APP_URL — origin фронта (без /api).
   */
  async sendEmployeeInvite(params: {
    to: string;
    inviteUrl: string;
    employeeName: string;
    companyName?: string;
    inviterName?: string;
    expiresHours: number;
  }) {
    if (!this.transporter) {
      throw new BadRequestException(
        'Почтовый сервер не настроен. Приглашение сотрудника временно недоступно.',
      );
    }

    const from = this.getPassFromAddress();
    const company = params.companyName?.trim() || 'компанию';
    const who = params.inviterName?.trim() || 'Руководитель';
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <div style="padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
          <h2 style="margin:0 0 12px;font-size:20px">Приглашение в систему пропусков</h2>
          <p style="margin:0 0 16px;line-height:1.5;color:#475569">
            Здравствуйте${params.employeeName ? `, ${params.employeeName}` : ''}!<br/>
            ${who} приглашает вас в ${company}.
            Перейдите по ссылке и задайте пароль для входа (ссылка действует ${params.expiresHours} ч.):
          </p>
          <div style="text-align:center;margin:20px 0">
            <a href="${params.inviteUrl}"
               style="display:inline-block;background:#eb711c;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
              Принять приглашение
            </a>
          </div>
          <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">
            Если кнопка не работает, откройте ссылку:<br/>
            <a href="${params.inviteUrl}">${params.inviteUrl}</a>
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:#64748b">
            Если вы не ожидали это письмо, просто проигнорируйте его.
          </p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to: params.to,
        subject: `Приглашение: доступ к пропускам${params.companyName ? ` — ${params.companyName}` : ''}`,
        text: [
          `Здравствуйте${params.employeeName ? `, ${params.employeeName}` : ''}!`,
          `${who} приглашает вас в ${company}.`,
          `Откройте ссылку и задайте пароль (действует ${params.expiresHours} ч.):`,
          params.inviteUrl,
        ].join('\n'),
        html,
      });
      this.logger.log(`Employee invite emailed to ${params.to}`);
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка SMTP';
      this.logger.error(`Employee invite email failed to ${params.to}: ${message}`);
      throw new InternalServerErrorException('Не удалось отправить приглашение на почту');
    }
  }

  /** Origin фронта для ссылок в письмах (без trailing slash). */
  getPublicAppOrigin(): string {
    return (this.configService.get<string>('PUBLIC_APP_URL') || 'https://pass.mstyle.ru')
      .replace(/\/$/, '');
  }

  private getAppHost(): string {
    return this.getPublicAppOrigin()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
  }

  private buildCodeEmailHtml(params: {
    title: string;
    intro: string;
    code: string;
    footer: string;
  }): string {
    return `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <div style="padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
          <h2 style="margin:0 0 12px;font-size:20px">${params.title}</h2>
          <p style="margin:0 0 16px;line-height:1.5;color:#475569">
            ${params.intro}
          </p>
          <div style="font-size:32px;font-weight:700;letter-spacing:0.35em;text-align:center;padding:16px;background:#f8fafc;border-radius:8px">
            ${params.code}
          </div>
          <p style="margin:16px 0 0;font-size:13px;color:#64748b">
            ${params.footer}
          </p>
        </div>
      </div>
    `;
  }

  private getPassFromAddress(): string {
    const configured = this.configService.get<string>('SMTP_FROM');
    const user = this.configService.get<string>('SMTP_USER');
    const emailFromConfigured = configured?.match(/<([^>]+)>/)?.[1];
    const bareEmail = configured && !configured.includes('<') ? configured.trim() : undefined;
    const email = emailFromConfigured || bareEmail || user || 'pass@mstyle.ru';
    return `${PASS_FROM_DISPLAY_NAME} <${email}>`;
  }

  private initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST not set — email sending disabled');
      return;
    }

    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const secure = this.configService.get<string>('SMTP_SECURE') === 'true';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' },
    });

    this.logger.log(`SMTP configured: ${host}:${port} (auth: ${user ? 'yes' : 'no'}, secure: ${secure})`);
  }
}