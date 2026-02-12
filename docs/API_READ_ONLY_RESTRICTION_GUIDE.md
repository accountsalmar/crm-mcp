# Complete Guide: Restricting Odoo API to Read-Only Access

## Executive Summary

This guide provides multiple methods to restrict an Odoo API user to **read-only access**, preventing any AI, Claude Code, MCP servers, or external integrations from performing write, create, or delete operations.

**User:** accounting@qagroup.com.au (UID: 105)
**Database:** 26_01_06
**Current Status:** Has FULL access to 99 models (including res.partner, project.task)

---

## Table of Contents

1. [Method 1: Odoo Access Rights (ir.model.access) - RECOMMENDED](#method-1-odoo-access-rights)
2. [Method 2: Create Dedicated Read-Only Security Group](#method-2-dedicated-security-group)
3. [Method 3: Custom Odoo Module - Block Write Operations](#method-3-custom-odoo-module)
4. [Method 4: MCP Server-Side Restrictions](#method-4-mcp-server-restrictions)
5. [Method 5: XML-RPC Proxy Middleware](#method-5-xmlrpc-proxy-middleware)
6. [Method 6: Claude Code Permission Configuration](#method-6-claude-code-permissions)
7. [Comparison Matrix](#comparison-matrix)
8. [Implementation Recommendations](#implementation-recommendations)

---

## Method 1: Odoo Access Rights (ir.model.access) {#method-1-odoo-access-rights}

### Description
Modify the Access Control List (ACL) directly in Odoo to set read-only permissions for all models.

### How It Works
- Each model has access rights defined in `ir.model.access`
- Set `perm_read=1` and `perm_write=0, perm_create=0, perm_unlink=0`
- Applied per security group

### Implementation Steps

#### Option A: Via Odoo UI (Quick)
1. Go to **Settings → Technical → Security → Access Control Lists**
2. Filter by the user's groups (e.g., "Duracube / Sales Read Only")
3. For each entry, uncheck Write, Create, Delete - keep only Read

#### Option B: Via CSV File (Bulk)
Create `ir.model.access.csv`:
```csv
id,name,model_id/id,group_id/id,perm_read,perm_write,perm_create,perm_unlink
access_res_partner_readonly,res.partner readonly,model_res_partner,your_readonly_group,1,0,0,0
access_crm_lead_readonly,crm.lead readonly,model_crm_lead,your_readonly_group,1,0,0,0
access_sale_order_readonly,sale.order readonly,model_sale_order,your_readonly_group,1,0,0,0
```

#### Option C: Via Python Script (API)
```python
import xmlrpc.client

url = 'https://duracubeuat.com.au'
db = '26_01_06'
username = 'admin'  # Need admin access
password = 'admin_password'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Find all access rights for a specific group
group_id = 123  # Your read-only group ID
access_rights = models.execute_kw(db, uid, password,
    'ir.model.access', 'search_read',
    [[['group_id', '=', group_id]]],
    {'fields': ['id', 'name', 'perm_read', 'perm_write', 'perm_create', 'perm_unlink']}
)

# Update each to read-only
for access in access_rights:
    models.execute_kw(db, uid, password,
        'ir.model.access', 'write',
        [[access['id']], {'perm_write': False, 'perm_create': False, 'perm_unlink': False}]
    )
```

### Pros
- Native Odoo solution - no custom code needed
- Enforced at database level - cannot be bypassed by API
- Granular control per model
- Works immediately

### Cons
- Need admin access to configure
- Must update for each new model
- Additive nature - user might get permissions from other groups

### Effort: ⭐⭐ (Low-Medium)
### Security Level: ⭐⭐⭐⭐⭐ (Highest)

---

## Method 2: Create Dedicated Read-Only Security Group {#method-2-dedicated-security-group}

### Description
Create a new security group specifically for API read-only access and assign only read permissions.

### Implementation Steps

1. **Create the Group**
   - Go to **Settings → Users & Companies → Groups**
   - Click **Create**
   - Name: "API Read Only Access"
   - Application: Technical Settings

2. **Configure Access Rights**
   - In the group form, go to **Access Rights** tab
   - Click **Add a line** for each model you want to allow
   - Set only **Read** permission for each model

3. **Create Dedicated API User**
   - Create a new user specifically for API access
   - Remove from ALL other groups
   - Add ONLY to "API Read Only Access" group

4. **Generate API Key**
   - Go to user's profile → Preferences
   - Under "API Keys", click **Generate**
   - Use this API key instead of password

### Example Group Configuration

| Model | Read | Write | Create | Delete |
|-------|------|-------|--------|--------|
| res.partner | ✅ | ❌ | ❌ | ❌ |
| crm.lead | ✅ | ❌ | ❌ | ❌ |
| sale.order | ✅ | ❌ | ❌ | ❌ |
| account.move | ✅ | ❌ | ❌ | ❌ |
| project.project | ✅ | ❌ | ❌ | ❌ |
| project.task | ✅ | ❌ | ❌ | ❌ |

### Pros
- Clean separation of concerns
- Easy to audit who has API access
- Can revoke API key without affecting main user
- Standard Odoo best practice

### Cons
- Requires creating and maintaining a new group
- Must manually add access for each model
- Requires admin access

### Effort: ⭐⭐⭐ (Medium)
### Security Level: ⭐⭐⭐⭐⭐ (Highest)

---

## Method 3: Custom Odoo Module - Block Write Operations {#method-3-custom-odoo-module}

### Description
Create a custom Odoo module that overrides `create`, `write`, and `unlink` methods to block operations from specific users or via API.

### Module Structure
```
api_readonly_restriction/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── api_restriction_mixin.py
└── security/
    └── ir.model.access.csv
```

### Code: `__manifest__.py`
```python
{
    'name': 'API Read-Only Restriction',
    'version': '17.0.1.0.0',
    'category': 'Technical',
    'summary': 'Restrict API users to read-only access',
    'depends': ['base'],
    'data': [],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

### Code: `models/api_restriction_mixin.py`
```python
from odoo import models, api
from odoo.exceptions import UserError

# List of user IDs that should be read-only
API_READONLY_USER_IDS = [105]  # accounting@qagroup.com.au

# Or use a group-based check
API_READONLY_GROUP = 'api_readonly_restriction.group_api_readonly'


class APIReadOnlyMixin(models.AbstractModel):
    _name = 'api.readonly.mixin'
    _description = 'API Read-Only Restriction Mixin'

    def _check_api_readonly(self, operation):
        """Check if current user is restricted to read-only API access"""
        if self.env.uid in API_READONLY_USER_IDS:
            raise UserError(
                f"API Read-Only Restriction: {operation} operation is not allowed. "
                f"User {self.env.user.login} has read-only API access."
            )
        # Alternative: Group-based check
        # if self.env.user.has_group(API_READONLY_GROUP):
        #     raise UserError(...)

    @api.model_create_multi
    def create(self, vals_list):
        self._check_api_readonly('CREATE')
        return super().create(vals_list)

    def write(self, vals):
        self._check_api_readonly('WRITE')
        return super().write(vals)

    def unlink(self):
        self._check_api_readonly('DELETE')
        return super().unlink()


# Inherit mixin into critical models
class ResPartner(models.Model):
    _name = 'res.partner'
    _inherit = ['res.partner', 'api.readonly.mixin']


class ProjectTask(models.Model):
    _name = 'project.task'
    _inherit = ['project.task', 'api.readonly.mixin']


class CrmLead(models.Model):
    _name = 'crm.lead'
    _inherit = ['crm.lead', 'api.readonly.mixin']


class SaleOrder(models.Model):
    _name = 'sale.order'
    _inherit = ['sale.order', 'api.readonly.mixin']


class AccountMove(models.Model):
    _name = 'account.move'
    _inherit = ['account.move', 'api.readonly.mixin']


# Add more models as needed...
```

### Advanced Version: Detect API vs UI Access
```python
from odoo import models, api
from odoo.exceptions import UserError
from odoo.http import request


class APIReadOnlyMixin(models.AbstractModel):
    _name = 'api.readonly.mixin'
    _description = 'API Read-Only Restriction Mixin'

    def _is_api_request(self):
        """Detect if current request is from XML-RPC/JSON-RPC API"""
        try:
            # If there's no request context, it's likely an API call
            if not request:
                return True
            # Check if it's an RPC endpoint
            if hasattr(request, 'httprequest'):
                path = request.httprequest.path
                if '/xmlrpc/' in path or '/jsonrpc' in path:
                    return True
        except:
            # No request context = API call
            return True
        return False

    def _check_api_readonly(self, operation):
        if self._is_api_request() and self.env.uid in [105]:
            raise UserError(
                f"API Write Access Denied: {operation} operations are blocked for API users."
            )

    @api.model_create_multi
    def create(self, vals_list):
        self._check_api_readonly('CREATE')
        return super().create(vals_list)

    def write(self, vals):
        self._check_api_readonly('WRITE')
        return super().write(vals)

    def unlink(self):
        self._check_api_readonly('DELETE')
        return super().unlink()
```

### Pros
- Highly customizable logic
- Can differentiate between API and UI access
- Can log blocked attempts
- Works even if ACL is misconfigured

### Cons
- Requires Odoo development knowledge
- Must be maintained with Odoo upgrades
- Must inherit into each model
- Adds slight performance overhead

### Effort: ⭐⭐⭐⭐ (High)
### Security Level: ⭐⭐⭐⭐⭐ (Highest)

---

## Method 4: MCP Server-Side Restrictions {#method-4-mcp-server-restrictions}

### Description
Modify the MCP server code to filter out write operations before they reach Odoo.

### Implementation: Wrapper Around Odoo Client

```typescript
// odoo-readonly-client.ts

import xmlrpc from 'xmlrpc';

const BLOCKED_METHODS = ['create', 'write', 'unlink', 'copy'];
const BLOCKED_METHOD_PATTERNS = [
    /^action_/,      // action_confirm, action_cancel, etc.
    /^button_/,      // button_confirm, etc.
    /_create$/,
    /_write$/,
    /_delete$/,
];

class OdooReadOnlyClient {
    private client: any;
    private db: string;
    private uid: number;
    private password: string;

    constructor(url: string, db: string, uid: number, password: string) {
        this.client = xmlrpc.createSecureClient({ url: `${url}/xmlrpc/2/object` });
        this.db = db;
        this.uid = uid;
        this.password = password;
    }

    private isBlockedMethod(method: string): boolean {
        // Check exact matches
        if (BLOCKED_METHODS.includes(method)) {
            return true;
        }
        // Check patterns
        for (const pattern of BLOCKED_METHOD_PATTERNS) {
            if (pattern.test(method)) {
                return true;
            }
        }
        return false;
    }

    async execute(model: string, method: string, args: any[], kwargs?: any): Promise<any> {
        // Block write operations
        if (this.isBlockedMethod(method)) {
            throw new Error(
                `READ-ONLY MODE: Method '${method}' is blocked on model '${model}'. ` +
                `Only read operations (search, read, search_read, fields_get) are allowed.`
            );
        }

        return new Promise((resolve, reject) => {
            this.client.methodCall('execute_kw', [
                this.db,
                this.uid,
                this.password,
                model,
                method,
                args,
                kwargs || {}
            ], (err: any, result: any) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    // Convenience methods for allowed operations
    async search(model: string, domain: any[], options?: any): Promise<number[]> {
        return this.execute(model, 'search', [domain], options);
    }

    async read(model: string, ids: number[], fields?: string[]): Promise<any[]> {
        return this.execute(model, 'read', [ids], { fields });
    }

    async searchRead(model: string, domain: any[], options?: any): Promise<any[]> {
        return this.execute(model, 'search_read', [domain], options);
    }

    async fieldsGet(model: string): Promise<any> {
        return this.execute(model, 'fields_get', [], { attributes: ['string', 'type'] });
    }

    async searchCount(model: string, domain: any[]): Promise<number> {
        return this.execute(model, 'search_count', [domain]);
    }
}

export default OdooReadOnlyClient;
```

### Environment Variable Control
```typescript
// config.ts
export const ODOO_READONLY_MODE = process.env.ODOO_READONLY_MODE === 'true';

// In your MCP tools
if (ODOO_READONLY_MODE && isWriteOperation(method)) {
    throw new Error('This MCP server is configured for read-only access');
}
```

### Pros
- No changes needed in Odoo
- Quick to implement
- Can be version-controlled with MCP code
- Easy to toggle on/off

### Cons
- Only protects this specific MCP server
- User could use another tool to access Odoo
- Doesn't prevent direct API calls
- Defense-in-depth layer, not primary security

### Effort: ⭐⭐ (Low)
### Security Level: ⭐⭐⭐ (Medium - complementary only)

---

## Method 5: XML-RPC Proxy Middleware {#method-5-xmlrpc-proxy-middleware}

### Description
Deploy a reverse proxy that intercepts XML-RPC calls and blocks write operations.

### Architecture
```
Claude/MCP → XML-RPC Proxy → Odoo Server
                ↓
        (Filters write operations)
```

### Implementation: Python Proxy Server

```python
# xmlrpc_readonly_proxy.py

from xmlrpc.server import SimpleXMLRPCServer
import xmlrpc.client
from functools import wraps

ODOO_URL = 'https://duracubeuat.com.au'
PROXY_PORT = 8070

# Methods that are allowed (read-only)
ALLOWED_METHODS = {
    'search', 'search_read', 'read', 'fields_get', 'search_count',
    'name_get', 'name_search', 'check_access_rights', 'check_access_rule',
    'default_get', 'onchange', 'read_group', 'export_data',
}

# Methods that are blocked (write operations)
BLOCKED_METHODS = {
    'create', 'write', 'unlink', 'copy', 'action_confirm', 'action_cancel',
    'action_done', 'button_confirm', 'button_cancel', 'button_draft',
    'message_post', 'message_subscribe', 'action_set_won', 'action_set_lost',
}


class OdooReadOnlyProxy:
    def __init__(self):
        self.common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
        self.models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')

    def authenticate(self, db, username, password, context=None):
        """Pass-through authentication"""
        return self.common.authenticate(db, username, password, context or {})

    def execute_kw(self, db, uid, password, model, method, args, kwargs=None):
        """Intercept and filter execute_kw calls"""

        # Check if method is allowed
        if method in BLOCKED_METHODS:
            raise Exception(
                f"READ-ONLY PROXY: Method '{method}' is blocked. "
                f"This proxy only allows read operations."
            )

        if method not in ALLOWED_METHODS:
            # Log unknown methods for review
            print(f"WARNING: Unknown method '{method}' on model '{model}' - allowing for now")

        # Forward to Odoo
        return self.models.execute_kw(db, uid, password, model, method, args, kwargs or {})


def run_proxy():
    server = SimpleXMLRPCServer(('0.0.0.0', PROXY_PORT), allow_none=True)
    proxy = OdooReadOnlyProxy()

    # Register endpoints
    server.register_instance(proxy)

    print(f"XML-RPC Read-Only Proxy running on port {PROXY_PORT}")
    print(f"Forwarding to: {ODOO_URL}")
    print(f"Blocked methods: {BLOCKED_METHODS}")

    server.serve_forever()


if __name__ == '__main__':
    run_proxy()
```

### Docker Deployment
```dockerfile
# Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY xmlrpc_readonly_proxy.py .
CMD ["python", "xmlrpc_readonly_proxy.py"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  odoo-readonly-proxy:
    build: .
    ports:
      - "8070:8070"
    environment:
      - ODOO_URL=https://duracubeuat.com.au
    restart: unless-stopped
```

### Pros
- Works with any client, not just MCP
- Centralized control point
- Can log all access attempts
- No changes to Odoo needed

### Cons
- Additional infrastructure to maintain
- Single point of failure
- Network latency added
- Must update allowed methods list

### Effort: ⭐⭐⭐ (Medium)
### Security Level: ⭐⭐⭐⭐ (High - but can be bypassed)

---

## Method 6: Claude Code Permission Configuration {#method-6-claude-code-permissions}

### Description
Configure Claude Code's permission system to deny write operations at the AI level.

### Configuration File: `.claude/settings.json`
```json
{
  "permissions": {
    "deny": [
      "mcp__odoo__create:*",
      "mcp__odoo__write:*",
      "mcp__odoo__unlink:*",
      "mcp__odoo__action_*",
      "mcp__odoo__button_*"
    ],
    "allow": [
      "mcp__odoo__search:*",
      "mcp__odoo__search_read:*",
      "mcp__odoo__read:*",
      "mcp__odoo__fields_get:*"
    ]
  }
}
```

### Using Hooks for Real-Time Blocking
```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__odoo__*",
        "script": "node scripts/check-readonly.js"
      }
    ]
  }
}
```

```javascript
// scripts/check-readonly.js
const input = JSON.parse(process.argv[2] || '{}');
const blockedMethods = ['create', 'write', 'unlink', 'copy'];

const toolName = input.tool_name || '';
const params = input.tool_input || {};

// Check if this is a write operation
if (blockedMethods.some(m => toolName.includes(m) || params.method === m)) {
    console.error(JSON.stringify({
        decision: "block",
        reason: "Write operations are blocked. This API is read-only."
    }));
    process.exit(1);
}

// Allow the operation
console.log(JSON.stringify({ decision: "allow" }));
```

### Pros
- Quick to implement
- No Odoo changes needed
- Works within Claude Code ecosystem

### Cons
- Only affects Claude Code, not other clients
- User can modify settings
- Not a true security measure - more of a guardrail
- Depends on tool naming conventions

### Effort: ⭐ (Lowest)
### Security Level: ⭐⭐ (Low - easily bypassed)

---

## Comparison Matrix {#comparison-matrix}

| Method | Security Level | Effort | Maintenance | Bypass Risk | Scope |
|--------|---------------|--------|-------------|-------------|-------|
| **1. Odoo ACL** | ⭐⭐⭐⭐⭐ | ⭐⭐ | Low | None (DB level) | All clients |
| **2. Dedicated Group** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Medium | None (DB level) | All clients |
| **3. Custom Module** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | High | None (Code level) | All clients |
| **4. MCP Wrapper** | ⭐⭐⭐ | ⭐⭐ | Low | High (use other client) | This MCP only |
| **5. XML-RPC Proxy** | ⭐⭐⭐⭐ | ⭐⭐⭐ | Medium | Medium (direct connect) | Network level |
| **6. Claude Config** | ⭐⭐ | ⭐ | Low | Very High | Claude only |

---

## Implementation Recommendations {#implementation-recommendations}

### Recommended Approach: Defense in Depth

For maximum security, implement **multiple layers**:

#### Layer 1: Odoo Access Rights (Primary - MANDATORY)
```
Priority: CRITICAL
Implementation: Immediate
```
1. Create dedicated API user
2. Create "API Read-Only" security group
3. Configure access rights for all models with only Read permission
4. Generate API key for the user
5. Use API key in your MCP/integrations

#### Layer 2: Custom Odoo Module (Secondary - RECOMMENDED)
```
Priority: HIGH
Implementation: Within 1 week
```
- Install the API restriction module
- Provides audit logging
- Catches any ACL misconfigurations

#### Layer 3: MCP Server Wrapper (Tertiary - OPTIONAL)
```
Priority: MEDIUM
Implementation: As needed
```
- Quick implementation in your MCP code
- Provides clear error messages
- Good for user experience

### Quick Win: Immediate Action

If you need to restrict access **right now**, run this script with admin credentials:

```python
# quick_restrict_user.py
import xmlrpc.client

# Configuration
ODOO_URL = 'https://duracubeuat.com.au'
DB = '26_01_06'
ADMIN_USER = 'admin'
ADMIN_PASS = 'your_admin_password'
TARGET_USER_ID = 105  # accounting@qagroup.com.au

common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')

uid = common.authenticate(DB, ADMIN_USER, ADMIN_PASS, {})

# Get all access rights for user's groups
user = models.execute_kw(DB, uid, ADMIN_PASS,
    'res.users', 'read', [[TARGET_USER_ID]], {'fields': ['groups_id']})
group_ids = user[0]['groups_id']

# Find all access rights for these groups
access_rights = models.execute_kw(DB, uid, ADMIN_PASS,
    'ir.model.access', 'search_read',
    [[['group_id', 'in', group_ids]]],
    {'fields': ['id', 'name', 'model_id', 'perm_read', 'perm_write', 'perm_create', 'perm_unlink']}
)

# Update all to read-only
for access in access_rights:
    if access['perm_write'] or access['perm_create'] or access['perm_unlink']:
        models.execute_kw(DB, uid, ADMIN_PASS,
            'ir.model.access', 'write',
            [[access['id']], {
                'perm_write': False,
                'perm_create': False,
                'perm_unlink': False
            }]
        )
        print(f"Restricted: {access['name']}")

print(f"\nDone! User {TARGET_USER_ID} is now read-only.")
```

---

## Verification Script

After implementing restrictions, verify with this test:

```python
# verify_readonly.py
import xmlrpc.client

ODOO_URL = 'https://duracubeuat.com.au'
DB = '26_01_06'
USERNAME = 'accounting@qagroup.com.au'
PASSWORD = '559078644388eaaf0b6da126aa0fdce74c881301'

common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')

uid = common.authenticate(DB, USERNAME, PASSWORD, {})

test_models = ['res.partner', 'crm.lead', 'sale.order', 'project.task', 'account.move']

print("Testing Read-Only Restrictions")
print("=" * 60)

for model in test_models:
    for operation in ['read', 'write', 'create', 'unlink']:
        try:
            result = models.execute_kw(DB, uid, PASSWORD,
                model, 'check_access_rights', [operation],
                {'raise_exception': False}
            )
            status = "✅ ALLOWED" if result else "❌ BLOCKED"
        except Exception as e:
            status = f"❌ ERROR: {e}"

        print(f"{model:20} | {operation:8} | {status}")
    print("-" * 60)
```

---

## Sources

- [Odoo Security Documentation](https://www.odoo.com/documentation/17.0/developer/reference/backend/security.html)
- [Odoo Access Rights Documentation](https://www.odoo.com/documentation/18.0/applications/general/users/access_rights.html)
- [ir.model.access Documentation](https://odoo-development.readthedocs.io/en/latest/odoo/models/ir.model.access.html)
- [ir.rule Record Rules](https://odoo-development.readthedocs.io/en/latest/odoo/models/ir.rule.html)
- [Override Create, Write, Unlink in Odoo](https://www.cybrosys.com/blog/how-to-override-create-write-and-unlink-methods-in-odoo-17)
- [Odoo API Integration Guide](https://www.getknit.dev/blog/odoo-api-integration-guide-in-depth)
- [Claude Code Permissions](https://stevekinney.com/courses/ai-development/claude-code-permissions)
- [MCP Best Practices](https://mcp-best-practice.github.io/mcp-best-practice/best-practice/)

---

*Document created: January 2025*
*For: DuraCube UAT Environment*
