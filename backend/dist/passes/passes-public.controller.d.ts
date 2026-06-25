import { PassesService } from './passes.service';
export declare class PassesPublicController {
    private readonly passesService;
    constructor(passesService: PassesService);
    getTicket(passNumber: string): Promise<{
        ticket: {
            passNumber: any;
            visitorName: any;
            companyName: any;
            visitPurpose: any;
            passType: any;
            vehiclePlate: any;
            visitDate: any;
            visitTimeFrom: any;
            visitTimeTo: any;
            businessCenterName: any;
            office: any;
            floor: any;
            status: any;
        };
    }>;
}
