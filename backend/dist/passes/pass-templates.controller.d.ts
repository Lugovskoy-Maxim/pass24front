import { CreatePassTemplateDto } from './dto/create-pass-template.dto';
import { PassTemplatesService } from './pass-templates.service';
export declare class PassTemplatesController {
    private readonly templatesService;
    constructor(templatesService: PassTemplatesService);
    findAll(req: any): Promise<{
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
    create(dto: CreatePassTemplateDto, req: any): Promise<{
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
    syncFromPasses(req: any): Promise<{
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
    createFromPass(passId: string, req: any, body?: {
        name?: string;
    }): Promise<{
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
    findOne(id: string, req: any): Promise<{
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
    update(id: string, dto: Partial<CreatePassTemplateDto>, req: any): Promise<{
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
    remove(id: string, req: any): Promise<{
        ok: boolean;
    }>;
}
