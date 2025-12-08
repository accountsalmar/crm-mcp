/**
 * ExportWriter - Handles writing CRM data to CSV, JSON, or XLSX files
 * Supports streaming writes for large datasets to minimize memory usage
 */
import type { ExportFormat } from '../types.js';
export type OdooRecord = Record<string, unknown>;
/**
 * ExportWriter class - handles writing exports to different formats
 */
export declare class ExportWriter {
    private format;
    private filePath;
    private fields;
    private writeStream;
    private workbook;
    private worksheet;
    private recordsWritten;
    private jsonRecords;
    constructor(options: {
        format: ExportFormat;
        outputDir: string;
        filename: string;
        fields: string[];
    });
    /**
     * Initialize the writer (create file, write headers)
     */
    initialize(): Promise<void>;
    /**
     * Write a batch of records to the file
     */
    writeBatch(records: OdooRecord[]): Promise<void>;
    /**
     * Write CSV batch
     */
    private writeCsvBatch;
    /**
     * Write XLSX batch
     */
    private writeXlsxBatch;
    /**
     * Finalize and close the file
     */
    finalize(): Promise<{
        filePath: string;
        sizeBytes: number;
    }>;
    /**
     * Get the file path
     */
    getFilePath(): string;
    /**
     * Get count of records written
     */
    getRecordsWritten(): number;
    /**
     * Clean up on error (delete partial file)
     */
    cleanup(): Promise<void>;
}
/**
 * Generate a timestamp-based filename
 */
export declare function generateExportFilename(exportType: string, customName?: string): string;
/**
 * Get output directory from environment or use default
 */
export declare function getOutputDirectory(customDir?: string): string;
/**
 * Get MIME type for export format
 */
export declare function getMimeType(format: ExportFormat): string;
//# sourceMappingURL=export-writer.d.ts.map