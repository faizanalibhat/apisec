All available template variables are available in the createVulnerabilityContext method in src/utils/template.js. Here's a quick reference:

## Available Template Variables:

### Request (Transformed) - `req.*`

- `{{ req.method }}` - HTTP method (GET, POST, etc.)
- `{{ req.url }}` - Full URL
- `{{ req.headers.* }}` - Any header (e.g., `{{ req.headers.Authorization }}`)
- `{{ req.body }}` - Request body
- `{{ req.params.* }}` - URL parameters

### Original Request - `original.*`

- `{{ original.name }}` - Request name from Postman
- `{{ original.method }}` - Original method
- `{{ original.url }}` - Original URL
- `{{ original.collectionName }}` - Collection name
- `{{ original.folderName }}` - Folder name
- `{{ original.workspaceName }}` - Workspace name
- `{{ original.description }}` - Request description

### Response - `res.*`

- `{{ res.status }}` - HTTP status code (200, 404, etc.)
- `{{ res.statusText }}` - Status text
- `{{ res.headers.* }}` - Response headers
- `{{ res.body }}` - Response body
- `{{ res.responseTime }}` - Response time in ms
- `{{ res.size }}` - Response size

### Rule - `rule.*`

- `{{ rule.name }}` - Rule name
- `{{ rule.category }}` - Rule category
- `{{ rule.severity }}` - Severity level
- `{{ rule.type }}` - Vulnerability type

### Match Result - `match.*`

- `{{ match.matched }}` - Boolean match result
- `{{ match.criteria }}` - What was matched
- `{{ match.expected }}` - Expected value
- `{{ match.actual }}` - Actual value
- `{{ match.operator }}` - Match operator

### Other

- `{{ transformations }}` - Array of applied transformations
- `{{ transformationSummary }}` - Summary of transformations
- `{{ endpoint }}` - URL path only
- `{{ host }}` - Host from URL
- `{{ scan.name }}` - Scan name
- `{{ scan.id }}` - Scan ID

To see the exact structure, check lines 108-163 in src/utils/template.js where the context object is built.