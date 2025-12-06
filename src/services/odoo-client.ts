import xmlrpc from 'xmlrpc';
const { createClient, createSecureClient } = xmlrpc;
type Client = ReturnType<typeof createClient>;
import type { OdooConfig, OdooRecord } from '../types.js';

// Odoo XML-RPC API client
export class OdooClient {
  private config: OdooConfig;
  private uid: number | null = null;
  private commonClient: Client;
  private objectClient: Client;

  constructor(config: OdooConfig) {
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
  async authenticate(): Promise<number> {
    if (this.uid !== null) {
      return this.uid;
    }

    return new Promise((resolve, reject) => {
      this.commonClient.methodCall(
        'authenticate',
        [this.config.db, this.config.username, this.config.password, {}],
        (error: unknown, value: unknown) => {
          if (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            reject(new Error(`Authentication failed: ${errMsg}`));
          } else if (value === false) {
            reject(new Error('Authentication failed: Invalid credentials'));
          } else {
            this.uid = value as number;
            resolve(this.uid);
          }
        }
      );
    });
  }

  // Execute Odoo model method
  private async execute<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    const uid = await this.authenticate();
    
    return new Promise((resolve, reject) => {
      this.objectClient.methodCall(
        'execute_kw',
        [
          this.config.db,
          uid,
          this.config.password,
          model,
          method,
          args,
          kwargs
        ],
        (error: unknown, value: unknown) => {
          if (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            reject(new Error(`Odoo API error: ${errMsg}`));
          } else {
            resolve(value as T);
          }
        }
      );
    });
  }

  // Search and read records with pagination
  async searchRead<T extends OdooRecord>(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    options: {
      offset?: number;
      limit?: number;
      order?: string;
    } = {}
  ): Promise<T[]> {
    const { offset = 0, limit = 10, order = 'id desc' } = options;
    
    return this.execute<T[]>(model, 'search_read', [domain], {
      fields,
      offset,
      limit,
      order
    });
  }

  // Count records matching domain
  async searchCount(model: string, domain: unknown[] = []): Promise<number> {
    return this.execute<number>(model, 'search_count', [domain]);
  }

  // Read specific records by IDs
  async read<T extends OdooRecord>(
    model: string,
    ids: number[],
    fields: string[] = []
  ): Promise<T[]> {
    return this.execute<T[]>(model, 'read', [ids], { fields });
  }

  // Read grouped data for aggregation
  async readGroup(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    groupby: string[] = [],
    options: {
      offset?: number;
      limit?: number;
      orderby?: string;
      lazy?: boolean;
    } = {}
  ): Promise<Array<Record<string, unknown>>> {
    return this.execute<Array<Record<string, unknown>>>(
      model,
      'read_group',
      [domain, fields, groupby],
      {
        offset: options.offset,
        limit: options.limit,
        orderby: options.orderby,
        lazy: options.lazy ?? true
      }
    );
  }

  // Get model fields metadata
  async fieldsGet(
    model: string,
    attributes: string[] = ['string', 'type', 'required']
  ): Promise<Record<string, unknown>> {
    return this.execute<Record<string, unknown>>(
      model,
      'fields_get',
      [],
      { attributes }
    );
  }
}

// Singleton instance - created from environment variables
let clientInstance: OdooClient | null = null;

export function getOdooClient(): OdooClient {
  if (!clientInstance) {
    const config: OdooConfig = {
      url: process.env.ODOO_URL || 'http://localhost:8069',
      db: process.env.ODOO_DB || 'odoo',
      username: process.env.ODOO_USERNAME || 'admin',
      password: process.env.ODOO_PASSWORD || 'admin'
    };
    
    // Validate configuration
    if (!config.url || !config.db || !config.username || !config.password) {
      throw new Error(
        'Missing Odoo configuration. Set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD environment variables.'
      );
    }
    
    clientInstance = new OdooClient(config);
  }
  
  return clientInstance;
}

// Reset client (useful for testing or reconnection)
export function resetOdooClient(): void {
  clientInstance = null;
}
