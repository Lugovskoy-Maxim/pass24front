import { Document, Types } from 'mongoose';
import { PassRequestStatus, PassType } from './enums';
export type PassRequestDocument = PassRequest & Document;
export declare class PassRequest {
    requestedBy: Types.ObjectId;
    property: Types.ObjectId;
    type: PassType;
    guestName?: string;
    guestPhone?: string;
    vehiclePlate?: string;
    desiredValidFrom?: Date;
    desiredValidTo?: Date;
    comment?: string;
    status: PassRequestStatus;
    reviewedBy?: Types.ObjectId;
    reviewedAt?: Date;
    reviewComment?: string;
    pass?: Types.ObjectId;
    meta?: Record<string, any>;
}
export declare const PassRequestSchema: import("mongoose").Schema<PassRequest, import("mongoose").Model<PassRequest, any, any, any, any, any, PassRequest>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PassRequest, Document<unknown, {}, PassRequest, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    requestedBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    property?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<PassType, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    guestName?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    guestPhone?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehiclePlate?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    desiredValidFrom?: import("mongoose").SchemaDefinitionProperty<Date | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    desiredValidTo?: import("mongoose").SchemaDefinitionProperty<Date | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    comment?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<PassRequestStatus, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reviewedBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reviewedAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reviewComment?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    pass?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    meta?: import("mongoose").SchemaDefinitionProperty<Record<string, any> | undefined, PassRequest, Document<unknown, {}, PassRequest, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassRequest & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, PassRequest>;
