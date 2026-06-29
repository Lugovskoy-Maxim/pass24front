import { HydratedDocument, Types } from 'mongoose';
export type PassTemplateDocument = HydratedDocument<PassTemplate>;
export declare class PassTemplate {
    createdBy: Types.ObjectId;
    name: string;
    source: string;
    sourcePassId?: Types.ObjectId;
    visitorName: string;
    visitorPhone?: string;
    companyName?: string;
    visitPurpose?: string;
    passType: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    visitTimeFrom?: string;
    visitTimeTo?: string;
    officeId?: Types.ObjectId;
    office?: string;
    floor?: string;
    businessCenterName?: string;
    comment?: string;
}
export declare const PassTemplateSchema: import("mongoose").Schema<PassTemplate, import("mongoose").Model<PassTemplate, any, any, any, any, any, PassTemplate>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    createdBy?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    name?: import("mongoose").SchemaDefinitionProperty<string, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    source?: import("mongoose").SchemaDefinitionProperty<string, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    sourcePassId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorName?: import("mongoose").SchemaDefinitionProperty<string, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitorPhone?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    companyName?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitPurpose?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    passType?: import("mongoose").SchemaDefinitionProperty<string, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehiclePlate?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    vehicleModel?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitTimeFrom?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    visitTimeTo?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    officeId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    office?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    floor?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    businessCenterName?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    comment?: import("mongoose").SchemaDefinitionProperty<string | undefined, PassTemplate, import("mongoose").Document<unknown, {}, PassTemplate, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PassTemplate & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, PassTemplate>;
