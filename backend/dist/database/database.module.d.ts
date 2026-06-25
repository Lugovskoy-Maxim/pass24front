import { DynamicModule } from '@nestjs/common';
export declare class DatabaseModule {
    static forFeature(): DynamicModule;
    static forFeatureOnly(models: {
        name: string;
        schema: any;
    }[]): DynamicModule;
}
