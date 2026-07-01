import { Document, Types } from 'mongoose';
export type PassDocument = Pass & Document;
export declare class Pass {
    passNumber: string;
    createdBy?: Types.ObjectId;
    creatorName?: string;
    creatorCompany?: string;
    creatorPhone?: string;
    visitorName: string;
    visitorPhone?: string;
    visitorPassportSeries?: string;
    visitorPassportNumber?: string;
    visitorPassportIssuedBy?: string;
    companyName?: string;
    visitPurpose?: string;
    passType: string;
    status: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    visitDate: string;
    visitTimeFrom?: string;
    visitTimeTo?: string;
    property?: Types.ObjectId;
    officeId?: Types.ObjectId;
    businessCenterName?: string;
    office: string;
    floor?: string;
    comment?: string;
    approvedBy?: string;
    approverName?: string;
    approvedAt?: string;
    rejectionReason?: string;
    checkedInAt?: string;
    checkedInBy?: string;
    checkerInName?: string;
    checkedOutAt?: string;
    checkedOutBy?: string;
    checkerOutName?: string;
    meta?: Record<string, any>;
}
export declare const PassSchema: import("mongoose").Schema<Pass, import("mongoose").Model<Pass, any, any, any, any, any, Pass>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Pass, Document<unknown, {}, Pass, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    passNumber?: import("mongoose").SchemaDefinitionProperty<string, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    creatorName?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    creatorCompany?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    creatorPhone?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorName?: import("mongoose").SchemaDefinitionProperty<string, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorPhone?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorPassportSeries?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorPassportNumber?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorPassportIssuedBy?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    companyName?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitPurpose?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    passType?: import("mongoose").SchemaDefinitionProperty<string, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehiclePlate?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehicleModel?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitDate?: import("mongoose").SchemaDefinitionProperty<string, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitTimeFrom?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitTimeTo?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    property?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    officeId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    businessCenterName?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    office?: import("mongoose").SchemaDefinitionProperty<string, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    floor?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    comment?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    approvedBy?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    approverName?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    approvedAt?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rejectionReason?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkedInAt?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkedInBy?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkerInName?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkedOutAt?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkedOutBy?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    checkerOutName?: import("mongoose").SchemaDefinitionProperty<string | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    meta?: import("mongoose").SchemaDefinitionProperty<Record<string, any> | undefined, Pass, Document<unknown, {}, Pass, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Pass & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Pass>;
