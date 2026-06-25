import { Document, Types } from 'mongoose';
import { PropertyType } from './enums';
export type PropertyDocument = Property & Document;
export declare class Property {
    name: string;
    address: string;
    type: PropertyType;
    code?: string;
    gates: string[];
    settings: Record<string, any>;
    isActive: boolean;
    parentProperty?: Types.ObjectId;
    admins: Types.ObjectId[];
}
export declare const PropertySchema: import("mongoose").Schema<Property, import("mongoose").Model<Property, any, any, any, any, any, Property>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Property, Document<unknown, {}, Property, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    name?: import("mongoose").SchemaDefinitionProperty<string, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    address?: import("mongoose").SchemaDefinitionProperty<string, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<PropertyType, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    code?: import("mongoose").SchemaDefinitionProperty<string | undefined, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    gates?: import("mongoose").SchemaDefinitionProperty<string[], Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    settings?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isActive?: import("mongoose").SchemaDefinitionProperty<boolean, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    parentProperty?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    admins?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], Property, Document<unknown, {}, Property, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Property & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Property>;
