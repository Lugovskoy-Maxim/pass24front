import { Document, Types } from 'mongoose';
export type AuthorizationDocument = Authorization & Document;
export declare class Authorization {
    principal: Types.ObjectId;
    grantedTo: Types.ObjectId;
    property: Types.ObjectId;
    description?: string;
    validFrom?: Date;
    validTo?: Date;
    isActive: boolean;
    allowedPassTypes?: string[];
}
export declare const AuthorizationSchema: import("mongoose").Schema<Authorization, import("mongoose").Model<Authorization, any, any, any, any, any, Authorization>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Authorization, Document<unknown, {}, Authorization, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    principal?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    grantedTo?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    property?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string | undefined, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    validFrom?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    validTo?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isActive?: import("mongoose").SchemaDefinitionProperty<boolean, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    allowedPassTypes?: import("mongoose").SchemaDefinitionProperty<string[] | undefined, Authorization, Document<unknown, {}, Authorization, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Authorization & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Authorization>;
