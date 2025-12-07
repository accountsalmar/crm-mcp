import type { OdooConfig, OdooRecord } from '../types.js';
export declare class OdooClient {
    private config;
    private uid;
    private commonClient;
    private objectClient;
    constructor(config: OdooConfig);
    authenticate(): Promise<number>;
    private _doAuthenticate;
    private execute;
    private _doExecute;
    searchRead<T extends OdooRecord>(model: string, domain?: unknown[], fields?: string[], options?: {
        offset?: number;
        limit?: number;
        order?: string;
    }): Promise<T[]>;
    searchCount(model: string, domain?: unknown[]): Promise<number>;
    read<T extends OdooRecord>(model: string, ids: number[], fields?: string[]): Promise<T[]>;
    readGroup(model: string, domain?: unknown[], fields?: string[], groupby?: string[], options?: {
        offset?: number;
        limit?: number;
        orderby?: string;
        lazy?: boolean;
    }): Promise<Array<Record<string, unknown>>>;
    fieldsGet(model: string, attributes?: string[]): Promise<Record<string, unknown>>;
}
export declare function getOdooClient(): OdooClient;
export declare function resetOdooClient(): void;
//# sourceMappingURL=odoo-client.d.ts.map