import type { OdooConfig, OdooRecord, ExportProgress } from '../types.js';
export type ExportProgressCallback = (progress: ExportProgress) => void;
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
    /**
     * Fetch records in batches with progress tracking
     * Designed for large exports to avoid timeout issues
     */
    searchReadPaginated<T extends OdooRecord>(model: string, domain: unknown[] | undefined, fields: string[] | undefined, options: {
        maxRecords: number;
        batchSize?: number;
        order?: string;
        onProgress?: ExportProgressCallback;
    }): Promise<{
        records: T[];
        totalFetched: number;
        totalAvailable: number;
    }>;
    /**
     * Search and read with export batch timeout (longer than regular API timeout)
     */
    private searchReadWithTimeout;
}
export declare function getOdooClient(): OdooClient;
export declare function resetOdooClient(): void;
//# sourceMappingURL=odoo-client.d.ts.map