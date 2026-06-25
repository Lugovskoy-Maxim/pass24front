"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let MailService = MailService_1 = class MailService {
    configService;
    logger = new common_1.Logger(MailService_1.name);
    transporter = null;
    constructor(configService) {
        this.configService = configService;
        this.initTransporter();
    }
    isConfigured() {
        return !!this.transporter;
    }
    async sendPassTicket(data) {
        if (!this.transporter) {
            throw new common_1.BadRequestException('Почтовый сервер не настроен. Укажите SMTP_HOST, SMTP_PORT и SMTP_FROM в настройках сервера.');
        }
        const from = this.configService.get('SMTP_FROM') || 'PASS24 <noreply@pass24.local>';
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.ticketUrl)}`;
        const visitTime = data.visitTimeFrom
            ? `${data.visitTimeFrom}${data.visitTimeTo ? `–${data.visitTimeTo}` : ''}`
            : '';
        const officeLine = `оф. ${data.office}${data.floor ? `, ${data.floor} эт.` : ''}`;
        const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <div style="background:#0f2b4a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <div style="font-size:18px;font-weight:700">${data.businessCenterName || 'PASS24'}</div>
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
            `${data.businessCenterName || 'PASS24'} — электронный пропуск`,
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
    initTransporter() {
        const host = this.configService.get('SMTP_HOST');
        if (!host) {
            this.logger.warn('SMTP_HOST not set — email sending disabled');
            return;
        }
        const port = Number(this.configService.get('SMTP_PORT') || 587);
        const user = this.configService.get('SMTP_USER');
        const pass = this.configService.get('SMTP_PASS');
        const secure = this.configService.get('SMTP_SECURE') === 'true';
        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: user ? { user, pass } : undefined,
        });
    }
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MailService);
//# sourceMappingURL=mail.service.js.map