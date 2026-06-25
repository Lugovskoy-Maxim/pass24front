import { Model, Types } from 'mongoose';
import { AuditLogDocument, UserDocument } from '../schemas';
export interface AuditActor {
    userId?: string;
    email?: string;
    role?: string;
}
export interface AuditQuery {
    offset?: number;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
    action?: string;
    entityType?: string;
    userId?: string;
    search?: string;
}
export declare class AuditService {
    private auditLogModel;
    private userModel;
    constructor(auditLogModel: Model<AuditLogDocument>, userModel: Model<UserDocument>);
    log(params: {
        action: string;
        entityType: string;
        entityId?: string | Types.ObjectId;
        actor?: AuditActor;
        details?: Record<string, unknown>;
    }): Promise<void>;
    getAudit(query?: AuditQuery): Promise<{
        entries: {
            id: any;
            userId: any;
            userName: any;
            userEmail: any;
            action: any;
            entityType: any;
            entityId: any;
            entityLabel: string;
            details: any;
            createdAt: any;
        }[];
        total: number;
        offset: number;
        limit: number;
    }>;
    exportCsv(query?: AuditQuery): Promise<string>;
    private buildFilter;
    private escapeCsv;
    getRecent(limit?: number): Promise<{
        id: any;
        userId: any;
        userName: any;
        userEmail: any;
        action: any;
        entityType: any;
        entityId: any;
        entityLabel: string;
        details: any;
        createdAt: any;
    }[]>;
    private mapEntry;
    private formatEntityLabel;
}
