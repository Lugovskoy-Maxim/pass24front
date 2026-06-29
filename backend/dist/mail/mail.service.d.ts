import { ConfigService } from '@nestjs/config';
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
export declare class MailService {
    private readonly configService;
    private readonly logger;
    private transporter;
    constructor(configService: ConfigService);
    isConfigured(): boolean;
    sendPassTicket(data: PassTicketEmailData): Promise<{
        sent: boolean;
        to: string;
    }>;
    private initTransporter;
}
