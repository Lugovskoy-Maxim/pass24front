import { Document } from 'mongoose';
export type AccessConfigDocument = AccessConfig & Document;
export declare class AccessConfig {
    key: string;
    enabledPassTypes: string[];
    rolePermissions: Record<string, string[]>;
}
export declare const AccessConfigSchema: import("mongoose").Schema<AccessConfig, import("mongoose").Model<AccessConfig, any, any, any, any, any, AccessConfig>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AccessConfig, Document<unknown, {}, AccessConfig, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AccessConfig & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    key?: import("mongoose").SchemaDefinitionProperty<string, AccessConfig, Document<unknown, {}, AccessConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessConfig & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    enabledPassTypes?: import("mongoose").SchemaDefinitionProperty<string[], AccessConfig, Document<unknown, {}, AccessConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessConfig & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rolePermissions?: import("mongoose").SchemaDefinitionProperty<Record<string, string[]>, AccessConfig, Document<unknown, {}, AccessConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessConfig & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, AccessConfig>;
