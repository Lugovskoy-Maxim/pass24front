import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  passTypeLabel?: string;
  ticketUrl: string;
}

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

    const from = this.configService.get<string>('SMTP_FROM') || 'PASS24 <noreply@pass24.local>';
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
            ${data.passTypeLabel ? `<tr><td style="color:#64748b;padding:6px 0">Тип</td><td style="text-align:right;padding:6px 0">${data.passTypeLabel}</td></tr>` : ''}
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

    await this.transporter.sendMail({
      from,
      to: data.to,
      subject: `Пропуск ${data.passNumber} — ${data.visitorName}`,
      text,
      html,
    });

    this.logger.log(`Pass ticket emailed to ${data.to} (${data.passNumber})`);
    return { sent: true, to: data.to };
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
    });
  }
}