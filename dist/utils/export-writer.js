/**
 * ExportWriter - Handles writing CRM data to CSV, JSON, or XLSX files
 * Supports streaming writes for large datasets to minimize memory usage
 */
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { EXPORT_CONFIG } from '../constants.js';
/**
 * ExportWriter class - handles writing exports to different formats
 */
export class ExportWriter {
    format;
    filePath;
    fields;
    writeStream = null;
    workbook = null;
    worksheet = null;
    recordsWritten = 0;
    jsonRecords = [];
    constructor(options) {
        this.format = options.format;
        this.fields = options.fields;
        // Ensure output directory exists
        if (!fs.existsSync(options.outputDir)) {
            fs.mkdirSync(options.outputDir, { recursive: true });
        }
        // Build full file path
        const extension = options.format;
        this.filePath = path.join(options.outputDir, `${options.filename}.${extension}`);
    }
    /**
     * Initialize the writer (create file, write headers)
     */
    async initialize() {
        switch (this.format) {
            case 'csv':
                this.writeStream = fs.createWriteStream(this.filePath, { encoding: 'utf-8' });
                // Write CSV header
                this.writeStream.write(this.fields.join(',') + '\n');
                break;
            case 'xlsx':
                // Use streaming workbook writer for memory efficiency
                this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
                    filename: this.filePath,
                    useStyles: true,
                });
                this.worksheet = this.workbook.addWorksheet('Export');
                // Add header row with bold styling
                const headerRow = this.worksheet.addRow(this.fields);
                headerRow.font = { bold: true };
                headerRow.commit();
                break;
            case 'json':
                // JSON will be accumulated and written at the end
                this.jsonRecords = [];
                break;
        }
    }
    /**
     * Write a batch of records to the file
     */
    async writeBatch(records) {
        switch (this.format) {
            case 'csv':
                this.writeCsvBatch(records);
                break;
            case 'xlsx':
                this.writeXlsxBatch(records);
                break;
            case 'json':
                this.jsonRecords.push(...records);
                break;
        }
        this.recordsWritten += records.length;
    }
    /**
     * Write CSV batch
     */
    writeCsvBatch(records) {
        if (!this.writeStream)
            return;
        for (const record of records) {
            const row = this.fields.map(field => {
                const value = record[field];
                if (value === null || value === undefined)
                    return '';
                if (Array.isArray(value)) {
                    // Odoo relation fields are [id, name] arrays - use the name
                    return `"${String(value[1] || value[0]).replace(/"/g, '""')}"`;
                }
                if (typeof value === 'string') {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return String(value);
            }).join(',');
            this.writeStream.write(row + '\n');
        }
    }
    /**
     * Write XLSX batch
     */
    writeXlsxBatch(records) {
        if (!this.worksheet)
            return;
        for (const record of records) {
            const rowData = this.fields.map(field => {
                const value = record[field];
                if (value === null || value === undefined)
                    return '';
                if (Array.isArray(value)) {
                    // Odoo relation fields - return the display name
                    return String(value[1] || value[0]);
                }
                return value;
            });
            const row = this.worksheet.addRow(rowData);
            row.commit(); // Commit row immediately for streaming
        }
    }
    /**
     * Finalize and close the file
     */
    async finalize() {
        switch (this.format) {
            case 'csv':
                return new Promise((resolve, reject) => {
                    if (!this.writeStream) {
                        reject(new Error('Write stream not initialized'));
                        return;
                    }
                    this.writeStream.end(() => {
                        const stats = fs.statSync(this.filePath);
                        resolve({ filePath: this.filePath, sizeBytes: stats.size });
                    });
                });
            case 'xlsx':
                if (!this.workbook) {
                    throw new Error('Workbook not initialized');
                }
                await this.workbook.commit();
                const xlsxStats = fs.statSync(this.filePath);
                return { filePath: this.filePath, sizeBytes: xlsxStats.size };
            case 'json':
                const jsonContent = JSON.stringify(this.jsonRecords, null, 2);
                fs.writeFileSync(this.filePath, jsonContent, 'utf-8');
                const jsonStats = fs.statSync(this.filePath);
                return { filePath: this.filePath, sizeBytes: jsonStats.size };
            default:
                throw new Error(`Unknown format: ${this.format}`);
        }
    }
    /**
     * Get the file path
     */
    getFilePath() {
        return this.filePath;
    }
    /**
     * Get count of records written
     */
    getRecordsWritten() {
        return this.recordsWritten;
    }
    /**
     * Clean up on error (delete partial file)
     */
    async cleanup() {
        try {
            if (this.writeStream) {
                this.writeStream.destroy();
            }
            if (fs.existsSync(this.filePath)) {
                fs.unlinkSync(this.filePath);
            }
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
/**
 * Generate a timestamp-based filename
 */
export function generateExportFilename(exportType, customName) {
    if (customName) {
        return customName;
    }
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').substring(0, 14);
    return `${exportType}_${timestamp}`;
}
/**
 * Get output directory from environment or use default
 */
export function getOutputDirectory(customDir) {
    if (customDir) {
        return customDir;
    }
    return process.env[EXPORT_CONFIG.OUTPUT_DIR_ENV_VAR] || EXPORT_CONFIG.DEFAULT_OUTPUT_DIR;
}
/**
 * Get MIME type for export format
 */
export function getMimeType(format) {
    switch (format) {
        case 'csv':
            return 'text/csv';
        case 'json':
            return 'application/json';
        case 'xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
}
//# sourceMappingURL=export-writer.js.map