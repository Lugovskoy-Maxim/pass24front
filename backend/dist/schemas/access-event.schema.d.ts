import { Document, Types } from 'mongoose';
import { EventType } from './enums';
export type AccessEventDocument = AccessEvent & Document;
export declare class AccessEvent {
    timestamp: Date;
    type: EventType;
    property: Types.ObjectId;
    pass?: Types.ObjectId;
    passRequest?: Types.ObjectId;
    vehicle?: Types.ObjectId;
    vehiclePlate?: string;
    guestName?: string;
    actor?: Types.ObjectId;
    actorName?: string;
    gate?: string;
    comment?: string;
    meta?: Record<string, any>;
}
export declare const AccessEventSchema: import("mongoose").Schema<AccessEvent, import("mongoose").Model<AccessEvent, any, any, any, any, any, AccessEvent>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AccessEvent, Document<unknown, {}, AccessEvent, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    timestamp?: import("mongoose").SchemaDefinitionProperty<Date, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    type?: import("mongoose").SchemaDefinitionProperty<EventType, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    property?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    pass?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    passRequest?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehicle?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehiclePlate?: import("mongoose").SchemaDefinitionProperty<string | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    guestName?: import("mongoose").SchemaDefinitionProperty<string | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    actor?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    actorName?: import("mongoose").SchemaDefinitionProperty<string | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    gate?: import("mongoose").SchemaDefinitionProperty<string | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    comment?: import("mongoose").SchemaDefinitionProperty<string | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    meta?: import("mongoose").SchemaDefinitionProperty<Record<string, any> | undefined, AccessEvent, Document<unknown, {}, AccessEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AccessEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, AccessEvent>;
