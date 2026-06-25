import { Model, Types } from 'mongoose';
import { OfficeDocument, PassDocument, PassTemplate, PassTemplateDocument, PropertyDocument } from '../schemas';
import { CreatePassTemplateDto } from './dto/create-pass-template.dto';
export declare class PassTemplatesService {
    private templateModel;
    private passModel;
    private officeModel;
    private propertyModel;
    constructor(templateModel: Model<PassTemplateDocument>, passModel: Model<PassDocument>, officeModel: Model<OfficeDocument>, propertyModel: Model<PropertyDocument>);
    findAll(user: any): Promise<{
        templates: {
            id: any;
            name: any;
            source: any;
            sourcePassId: any;
            visitorName: any;
            visitorPhone: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            vehicleModel: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            officeId: any;
            businessCenterName: any;
            office: any;
            floor: any;
            comment: any;
            createdAt: any;
            updatedAt: any;
        }[];
    }>;
    findOne(id: string, user: any): Promise<{
        template: {
            id: any;
            name: any;
            source: any;
            sourcePassId: any;
            visitorName: any;
            visitorPhone: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            vehicleModel: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            officeId: any;
            businessCenterName: any;
            office: any;
            floor: any;
            comment: any;
            createdAt: any;
            updatedAt: any;
        };
    }>;
    create(dto: CreatePassTemplateDto, user: any): Promise<{
        template: {
            id: any;
            name: any;
            source: any;
            sourcePassId: any;
            visitorName: any;
            visitorPhone: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            vehicleModel: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            officeId: any;
            businessCenterName: any;
            office: any;
            floor: any;
            comment: any;
            createdAt: any;
            updatedAt: any;
        };
    }>;
    createFromPass(passId: string, user: any, name?: string): Promise<{
        template: {
            id: any;
            name: any;
            source: any;
            sourcePassId: any;
            visitorName: any;
            visitorPhone: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            vehicleModel: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            officeId: any;
            businessCenterName: any;
            office: any;
            floor: any;
            comment: any;
            createdAt: any;
            updatedAt: any;
        };
    }>;
    syncFromPasses(user: any): Promise<{
        imported: number;
        templates: {
            id: any;
            name: any;
            source: any;
            sourcePassId: any;
            visitorName: any;
            visitorPhone: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            vehicleModel: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            officeId: any;
            businessCenterName: any;
            office: any;
            floor: any;
            comment: any;
            createdAt: any;
            updatedAt: any;
        }[];
    }>;
    update(id: string, dto: Partial<CreatePassTemplateDto>, user: any): Promise<{
        template: {
            id: any;
            name: any;
            source: any;
            sourcePassId: any;
            visitorName: any;
            visitorPhone: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            vehicleModel: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            officeId: any;
            businessCenterName: any;
            office: any;
            floor: any;
            comment: any;
            createdAt: any;
            updatedAt: any;
        };
    }>;
    remove(id: string, user: any): Promise<{
        ok: boolean;
    }>;
    upsertFromPass(pass: any, userId: string, name?: string): Promise<import("mongoose").Document<unknown, {}, import("mongoose").Document<unknown, {}, PassTemplate, {}, import("mongoose").DefaultSchemaOptions> & PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    } & {
        id: string;
    }, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Document<unknown, {}, PassTemplate, {}, import("mongoose").DefaultSchemaOptions> & PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    } & {
        id: string;
    } & Required<{
        _id: Types.ObjectId;
    }>>;
    private resolveOfficeFields;
    private ensureOwner;
    private mapToFrontend;
}
