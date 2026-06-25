import { Document, Types } from 'mongoose';
export type OfficeDocument = Office & Document;
export declare class Office {
    property: Types.ObjectId;
    number: string;
    floor: string;
    areaSqm?: number;
    company?: string;
    tenantId?: Types.ObjectId;
    isActive: boolean;
}
export declare const OfficeSchema: import("mongoose").Schema<Office, import("mongoose").Model<Office, any, any, any, any, any, Office>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Office, Document<unknown, {}, Office, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    property?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    number?: import("mongoose").SchemaDefinitionProperty<string, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    floor?: import("mongoose").SchemaDefinitionProperty<string, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    areaSqm?: import("mongoose").SchemaDefinitionProperty<number | undefined, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    company?: import("mongoose").SchemaDefinitionProperty<string | undefined, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    tenantId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isActive?: import("mongoose").SchemaDefinitionProperty<boolean, Office, Document<unknown, {}, Office, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Office & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Office>;
