import { HydratedDocument } from 'mongoose';
export type AppSettingsDocument = HydratedDocument<AppSettings>;
export declare class AppSettings {
    key: string;
    siteName: string;
    siteIcon: string;
    siteTagline: string;
    sitePhone: string;
    siteEmail: string;
    brandMarkType: string;
    brandMarkText: string;
    brandShowName: boolean;
    brandNameBeforeMark: boolean;
    uiIconSelectChevron: string;
    uiLabels: Record<string, unknown>;
}
export declare const AppSettingsSchema: import("mongoose").Schema<AppSettings, import("mongoose").Model<AppSettings, any, any, any, any, any, AppSettings>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    key?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    siteName?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    siteIcon?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    siteTagline?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    sitePhone?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    siteEmail?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    brandMarkType?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    brandMarkText?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    brandShowName?: import("mongoose").SchemaDefinitionProperty<boolean, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    brandNameBeforeMark?: import("mongoose").SchemaDefinitionProperty<boolean, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    uiIconSelectChevron?: import("mongoose").SchemaDefinitionProperty<string, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    uiLabels?: import("mongoose").SchemaDefinitionProperty<Record<string, unknown>, AppSettings, import("mongoose").Document<unknown, {}, AppSettings, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppSettings & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, AppSettings>;
