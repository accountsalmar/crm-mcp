# Odoo CRM MCP Server

A Model Context Protocol (MCP) server for analyzing Odoo CRM data with intelligent context management. Designed to work with both desktop Claude and **browser-based Claude.ai**.

## Features

### Context-Aware Design
This MCP server is specifically designed to handle large CRM datasets without overwhelming Claude's context window:

- **Smart Pagination**: Default limit of 10 records, max 50 per request
- **Aggregation Tools**: Summary and analytics tools that return statistics instead of raw data
- **Flexible Filtering**: Narrow down results before fetching
- **Format Options**: JSON for processing, Markdown for readability

### Available Tools

| Tool | Purpose | Context Efficiency |
|------|---------|-------------------|
| `odoo_crm_get_sales_analytics` | KPIs, conversion rates, revenue analysis | ⭐⭐⭐ Highest - aggregated stats |
| `odoo_crm_get_pipeline_summary` | Pipeline overview by stage | ⭐⭐⭐ High - grouped summary |
| `odoo_crm_get_activity_summary` | Activity workload overview | ⭐⭐⭐ High - aggregated counts |
| `odoo_crm_list_stages` | Get stage IDs for filtering | ⭐⭐⭐ Minimal data |
| `odoo_crm_search_leads` | Search/filter leads with pagination | ⭐⭐ Medium - paginated |
| `odoo_crm_search_contacts` | Search contacts with pagination | ⭐⭐ Medium - paginated |
| `odoo_crm_get_lead_detail` | Full details for single lead | ⭐ Single record |

### Recommended Analysis Workflow

1. **Start with analytics**: Use `odoo_crm_get_sales_analytics` for overall picture
2. **Check pipeline**: Use `odoo_crm_get_pipeline_summary` to understand stage distribution
3. **Drill down**: Use `odoo_crm_search_leads` with filters to find specific opportunities
4. **Get details**: Use `odoo_crm_get_lead_detail` for individual records

## Installation

```bash
# Clone or copy the server files
cd odoo-crm-mcp-server

# Install dependencies
npm install

# Build TypeScript
npm run build
```

## Configuration

Set these environment variables:

```bash
export ODOO_URL="https://your-odoo-instance.com"
export ODOO_DB="your_database_name"
export ODOO_USERNAME="your_username"
export ODOO_PASSWORD="your_password_or_api_key"
```

## Running the Server

### For Desktop Claude / Claude Code (stdio transport)

```bash
# Default - runs on stdio
npm start

# Or explicitly
TRANSPORT=stdio npm start
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "odoo-crm": {
      "command": "node",
      "args": ["/path/to/odoo-crm-mcp-server/dist/index.js"],
      "env": {
        "ODOO_URL": "https://your-odoo.com",
        "ODOO_DB": "your_db",
        "ODOO_USERNAME": "admin",
        "ODOO_PASSWORD": "your_password"
      }
    }
  }
}
```

### For Browser Claude.ai (HTTP transport) ⭐

To use with browser-based Claude.ai, you need to run the server with HTTP transport and make it accessible via HTTPS.

#### Option 1: Local with ngrok (Quick Testing)

```bash
# Terminal 1: Start the server
TRANSPORT=http PORT=3000 npm start

# Terminal 2: Expose via ngrok
ngrok http 3000
```

Then add to Claude.ai via Settings → Integrations → Add MCP Server:
- URL: `https://your-ngrok-url.ngrok.io/mcp`

#### Option 2: Deploy to Cloud (Production)

**Deploy to Railway/Render/Fly.io:**

```bash
# Example with Railway
railway init
railway up

# Set environment variables in Railway dashboard:
# TRANSPORT=http
# PORT=3000
# ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD
```

**Deploy with Docker:**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV TRANSPORT=http
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t odoo-crm-mcp .
docker run -p 3000:3000 \
  -e ODOO_URL=https://your-odoo.com \
  -e ODOO_DB=your_db \
  -e ODOO_USERNAME=admin \
  -e ODOO_PASSWORD=your_password \
  odoo-crm-mcp
```

#### Option 3: Using Cloudflare Workers (Serverless)

For serverless deployment, you'll need to adapt the code to use Cloudflare Workers format. Contact for assistance.

### Adding to Browser Claude.ai

1. Go to [claude.ai](https://claude.ai)
2. Click your profile → Settings → Integrations
3. Click "Add MCP Server" (or similar)
4. Enter your server URL: `https://your-server.com/mcp`
5. Save and test

## Usage Examples

### Get Overall Performance
```
"Show me our CRM performance analytics"
→ Claude uses odoo_crm_get_sales_analytics
```

### Pipeline Overview
```
"What does our pipeline look like by stage?"
→ Claude uses odoo_crm_get_pipeline_summary
```

### Find Specific Opportunities
```
"Find opportunities over $50,000 in the negotiation stage"
→ Claude uses odoo_crm_search_leads with filters
```

### Check Activities
```
"Are there any overdue activities?"
→ Claude uses odoo_crm_get_activity_summary
```

## Tool Reference

### odoo_crm_get_sales_analytics

Get comprehensive KPIs and metrics.

**Parameters:**
- `date_from`: Start date (YYYY-MM-DD)
- `date_to`: End date (YYYY-MM-DD)
- `team_id`: Filter by sales team
- `include_by_salesperson`: Include breakdown by rep (default: true)
- `top_opportunities_count`: Number of top opps to show (0-10, default: 5)

### odoo_crm_get_pipeline_summary

Get aggregated pipeline by stage.

**Parameters:**
- `team_id`: Filter by sales team
- `user_id`: Filter by salesperson
- `include_lost`: Include lost opportunities
- `max_opps_per_stage`: Top opportunities per stage (0-10, default: 3)

### odoo_crm_search_leads

Search leads with filters and pagination.

**Parameters:**
- `query`: Search text (name, contact, email)
- `stage_id` / `stage_name`: Filter by stage
- `user_id`: Filter by salesperson
- `type`: 'lead' or 'opportunity'
- `min_revenue` / `max_revenue`: Revenue range
- `min_probability`: Minimum probability
- `date_from` / `date_to`: Creation date range
- `limit`: Results per page (default: 10, max: 50)
- `offset`: Pagination offset

### odoo_crm_get_lead_detail

Get full details for a single lead.

**Parameters:**
- `lead_id`: The ID of the lead/opportunity

### odoo_crm_search_contacts

Search contacts/partners.

**Parameters:**
- `query`: Search text
- `is_company`: Filter companies vs individuals
- `has_opportunities`: Only contacts with opportunities
- `country` / `city`: Location filters

### odoo_crm_get_activity_summary

Get activity workload summary.

**Parameters:**
- `user_id`: Filter by assigned user
- `days_ahead`: Days to include for upcoming (default: 7)
- `include_completed`: Include completed activities

### odoo_crm_list_stages

List all pipeline stages with IDs.

## Security Notes

- Never commit credentials to version control
- Use environment variables or secrets management
- For production, implement proper authentication on the HTTP endpoint
- Consider IP whitelisting for the MCP server

## Troubleshooting

### "Authentication failed"
- Verify ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD
- Ensure the user has CRM access rights in Odoo
- Check if Odoo is using API keys vs passwords

### "Connection refused"
- Verify Odoo URL is correct and accessible
- Check firewall/network settings
- Ensure Odoo's XML-RPC interface is enabled

### "Tool not found" in Claude.ai
- Verify the server is running with TRANSPORT=http
- Check the /health endpoint returns ok
- Ensure HTTPS is configured (required for browser Claude.ai)

## License

MIT
