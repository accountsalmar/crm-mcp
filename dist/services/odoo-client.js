import xmlrpc from 'xmlrpc';
const { createClient, createSecureClient } = xmlrpc;
// Odoo XML-RPC API client
export class OdooClient {
    config;
    uid = null;
    commonClient;
    objectClient;
    constructor(config) {
        this.config = config;
        // XML-RPC endpoints
        const commonUrl = new URL('/xmlrpc/2/common', config.url);
        const objectUrl = new URL('/xmlrpc/2/object', config.url);
        // Use secure client for HTTPS, regular client for HTTP
        const isSecure = config.url.startsWith('https');
        const clientFactory = isSecure ? createSecureClient : createClient;
        this.commonClient = clientFactory({
            host: commonUrl.hostname,
            port: isSecure ? 443 : (parseInt(commonUrl.port) || 80),
            path: commonUrl.pathname,
            headers: { 'Content-Type': 'text/xml' }
        });
        this.objectClient = clientFactory({
            host: objectUrl.hostname,
            port: isSecure ? 443 : (parseInt(objectUrl.port) || 80),
            path: objectUrl.pathname,
            headers: { 'Content-Type': 'text/xml' }
        });
    }
    // Authenticate and get user ID
    async authenticate() {
        if (this.uid !== null) {
            return this.uid;
        }
        return new Promise((resolve, reject) => {
            this.commonClient.methodCall('authenticate', [this.config.db, this.config.username, this.config.password, {}], (error, value) => {
                if (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    reject(new Error(`Authentication failed: ${errMsg}`));
                }
                else if (value === false) {
                    reject(new Error('Authentication failed: Invalid credentials'));
                }
                else {
                    this.uid = value;
                    resolve(this.uid);
                }
            });
        });
    }
    // Execute Odoo model method
    async execute(model, method, args = [], kwargs = {}) {
        const uid = await this.authenticate();
        return new Promise((resolve, reject) => {
            this.objectClient.methodCall('execute_kw', [
                this.config.db,
                uid,
                this.config.password,
                model,
                method,
                args,
                kwargs
            ], (error, value) => {
                if (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    reject(new Error(`Odoo API error: ${errMsg}`));
                }
                else {
                    resolve(value);
                }
            });
        });
    }
    // Search and read records with pagination
    async searchRead(model, domain = [], fields = [], options = {}) {
        const { offset = 0, limit = 10, order = 'id desc' } = options;
        return this.execute(model, 'search_read', [domain], {
            fields,
            offset,
            limit,
            order
        });
    }
    // Count records matching domain
    async searchCount(model, domain = []) {
        return this.execute(model, 'search_count', [domain]);
    }
    // Read specific records by IDs
    async read(model, ids, fields = []) {
        return this.execute(model, 'read', [ids], { fields });
    }
    // Read grouped data for aggregation
    async readGroup(model, domain = [], fields = [], groupby = [], options = {}) {
        return this.execute(model, 'read_group', [domain, fields, groupby], {
            offset: options.offset,
            limit: options.limit,
            orderby: options.orderby,
            lazy: options.lazy ?? true
        });
    }
    // Get model fields metadata
    async fieldsGet(model, attributes = ['string', 'type', 'required']) {
        return this.execute(model, 'fields_get', [], { attributes });
    }
}
// Singleton instance - created from environment variables
let clientInstance = null;
export function getOdooClient() {
    if (!clientInstance) {
        const config = {
            url: process.env.ODOO_URL || 'http://localhost:8069',
            db: process.env.ODOO_DB || 'odoo',
            username: process.env.ODOO_USERNAME || 'admin',
            password: process.env.ODOO_PASSWORD || 'admin'
        };
        // Validate configuration
        if (!config.url || !config.db || !config.username || !config.password) {
            throw new Error('Missing Odoo configuration. Set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD environment variables.');
        }
        clientInstance = new OdooClient(config);
    }
    return clientInstance;
}
// Reset client (useful for testing or reconnection)
export function resetOdooClient() {
    clientInstance = null;
}
//# sourceMappingURL=odoo-client.js.map