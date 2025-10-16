# APISEC - API Security Testing Platform Architecture

## Project Overview

APISEC is a comprehensive API security testing platform that identifies vulnerabilities by applying transformation rules to API requests and analyzing responses. The system imports API collections from Postman, applies security testing rules, executes transformed requests, and generates detailed vulnerability reports.

## Important Instructions

Please read this context carefully before providing any assistance.

- **DO NOT provide any code unless I explicitly ask for it**
- First understand my requirements, ask clarifying questions if needed
- When I do ask for code, follow the exact patterns described below

## System Architecture

### Technology Stack
- **Runtime**: Node.js with ES6 modules (import/export)
- **Framework**: Express.js for RESTful API
- **Database**: MongoDB with Mongoose ODM
- **Message Queue**: RabbitMQ for asynchronous processing
- **Architecture Pattern**: Class-based services and controllers
- **API Version**: /api/v1

### Project Structure

```
src/
├── controllers/         # Class-based HTTP request handlers
├── services/           # Business logic layer
│   ├── engine/         # Security testing engine
│   │   └── parts/      # Engine components (transformer, matcher, sender)
│   └── *.service.js    # Domain services
├── routes/             # Express route definitions
├── models/             # Mongoose schemas
├── middleware/         # Express middleware (validation, auth)
├── utils/              # Utility classes and helpers
│   └── postman/        # Postman integration utilities
├── workers/            # RabbitMQ workers for async processing
├── app.js              # Application entry point
└── env.js              # Environment configuration
```

## Core Workflow

```
1. Setup Phase:
   Postman API Key → Fetch User Info → Import Workspaces → Select Collections → Store Raw Requests & Environments

2. Configuration Phase:
   Create Security Rules (transformations + match criteria + report templates)

3. Execution Phase:
   Create Scan → Queue to RabbitMQ → Generate Transformed Requests → Save to DB → Workers Execute → Match Responses → Create Vulnerabilities

4. Analysis Phase:
   Generate Vulnerability Reports → Update Scan Results → Export Results
```

## Key Architectural Decisions

1. **No Base Classes**: Each controller and service is independent
2. **Service Layer Pattern**: Business logic in services, controllers handle HTTP only
3. **Asynchronous Processing**: RabbitMQ for scan execution
4. **Global Error Handling**: Centralized error transformation
5. **Standardized Responses**: ApiResponse class for consistency
6. **Organization Isolation**: req.orgId (temporary, will use JWT later)

## Rule System Architecture

### Triple Purpose of Rules

Rules in APISEC serve three critical functions:

1. **Transform**: Define how to modify requests for security testing
   - Headers manipulation (add, remove, modify)
   - Cookie operations
   - URL parameter modifications
   - Host override
   - Method changes
   - Request body modifications

2. **Match**: Specify criteria to identify vulnerabilities
   - HTTP status codes
   - Response body content (string matching, regex)
   - Header presence and values
   - Content-Type validation
   - Response size constraints
   - Response time thresholds

3. **Report**: Template for vulnerability documentation
   - Title and description
   - Severity level (critical, high, medium, low)
   - CVSS score
   - CWE ID
   - OWASP category
   - Remediation guidance

### Rule Processing Flow

```
Raw Request + Rule → Transformer → Transformed Request (saved to DB)
                                           ↓
                                    Worker Execution
                                           ↓
                            Response + Rule.match → Matcher
                                           ↓
                                 If matched: Rule.report → Vulnerability
```

## Data Flow Architecture

### Synchronous Flow (API Requests)
```
Client Request → Router → Controller → Service → Database
                                         ↓
Client Response ← Middleware ← Controller ← Service Response
```

### Asynchronous Flow (Scan Processing)
```
Scan Creation → RabbitMQ Queue → Transformation Worker
                                        ↓
                              Generate Transformed Requests
                                        ↓
                                 Save to Database
                                        ↓
                              Queue Execution Tasks
                                        ↓
                               Execution Worker
                                        ↓
                         Execute Requests + Match Responses
                                        ↓
                           Create Vulnerabilities
                                        ↓
                            Update Scan Stats
```

## Completed Modules

### 1. Rules Module ✅
- **Model**: Security test rules with transformations, match criteria, and report templates
- **Features**: CRUD operations, text search, YAML-based rule definitions
- **Structure**: Transform section, match section, report section
- **Purpose**: Define how to test, what to look for, and how to report findings

### 2. Integration Module ✅
- **Model**: Postman API integrations with encrypted keys and user metadata
- **Features**: Multiple integrations per organization, workspace selection, collection mapping
- **Security**: AES-256-GCM encryption for API keys
- **Postman Data**: Stores user ID, team domain, workspace-collection relationships
- **URL Generation**: Automatic Postman collection URL construction

### 3. Raw Request Module ✅
- **Model**: Individual API requests from Postman
- **Features**: CRUD, bulk operations, edit tracking, search and filters
- **Data**: Complete request context including collection metadata
- **Integration**: Links to Postman collections via Integration module

### 4. Raw Environment Module ✅
- **Model**: Postman environment configurations per workspace
- **Features**: CRUD, workspace filtering, variable management
- **Data**: Environment variables, workspace association, edit tracking
- **URL Generation**: Direct links to Postman environments

### 5. Scan Module ✅
- **Model**: Security scan sessions with findings and statistics
- **Features**: Asynchronous execution, progress tracking, vulnerability summary
- **Integration**: RabbitMQ for distributed processing
- **Statistics**: Track total requests, rules, transformations, vulnerabilities by severity

### 6. Vulnerability Module ✅
- **Model**: Detailed vulnerability records with evidence
- **Features**: CRUD, status management, notes, false positive marking
- **Evidence**: Full request/response pairs with transformation details
- **Report Data**: Inherits title, severity, CVSS from rule's report section
- **Export**: JSON and CSV formats

### 7. Transformed Request Module ✅
- **Model**: Requests after rule transformations applied
- **Purpose**: Persistent storage of transformed requests before execution
- **Tracking**: Execution state, applied transformations, match results
- **Lifecycle**: Created → Queued → Executed → Matched/Not Matched

## Engine Architecture

### Components
1. **Transformer**: Applies rule transformations to create transformed requests
2. **Sender**: Executes HTTP requests with timeout handling
3. **Matcher**: Analyzes responses against rule match criteria
4. **Engine Service**: Orchestrates the complete testing flow

### Processing Pipeline
1. Raw Request + Rule → Transformer → Transformed Request (saved)
2. Worker picks up transformed request + rule
3. Sender executes the transformed request
4. Matcher evaluates response using rule.match criteria
5. If matched, creates vulnerability using rule.report template

## Worker Architecture

### RabbitMQ Integration
- **Exchanges**: Topic exchange pattern
- **Queues**: Separate queues for transformation and execution
- **Workers**: Dedicated workers for each processing stage
- **Error Handling**: Retry logic with exponential backoff

### Scan Processing Pipeline
1. **Transformation Worker**:
   - Receives scan creation events
   - Generates all request × rule combinations
   - Creates and saves transformed request documents
   - Publishes execution tasks to queue

2. **Execution Worker**:
   - Receives transformed request ID and rule ID
   - Loads transformed request and rule from database
   - Executes requests using Sender
   - Matches responses using rule.match criteria
   - Creates vulnerabilities using rule.report template
   - Updates scan statistics

## Security Features

### Data Protection
- Encrypted storage of Postman API keys
- Organization-based data isolation
- Secure credential handling

### Vulnerability Detection
- SQL Injection patterns
- XSS vulnerabilities
- Authentication bypasses
- Information disclosure
- Security misconfigurations
- Rate limiting issues

## Postman Integration

### Data Collection
- **User Information**: Fetched via `/me` endpoint (user ID, team domain)
- **Workspaces**: Complete workspace metadata and associations
- **Collections**: Full collection details with Postman URLs
- **Environments**: Environment variables and configurations per workspace

### URL Generation Pattern
- **Collections**: `https://{teamDomain}.postman.co/workspace/{workspaceName}~{workspaceId}/collection/{userId}-{collectionUid}`
- **Environments**: `https://{teamDomain}.postman.co/workspace/{workspaceName}~{workspaceId}/environment/{userId}-{environmentUid}`

## API Patterns

### Route Structure
```javascript
router.get('/search', controller.search)      // Search must be before :id
router.get('/', controller.getAll)           // List with pagination
router.post('/', controller.create)          // Create new resource
router.get('/:id', controller.get)           // Get single resource
router.put('/:id', controller.update)        // Update resource
router.delete('/:id', controller.delete)     // Delete resource
```

### Response Format
```javascript
// Success Response
{
  status: 'success',
  message: 'Operation completed',
  data: { ... },
  timestamp: '2024-01-01T00:00:00Z'
}

// Paginated Response
{
  status: 'success',
  message: 'Data retrieved',
  data: [ ... ],
  meta: {
    pagination: {
      page: 1,
      limit: 20,
      total: 100,
      pages: 5
    }
  }
}

// Error Response
{
  status: 'error',
  message: 'Validation failed',
  errors: [ ... ],
  timestamp: '2024-01-01T00:00:00Z'
}
```

## Database Schema Overview

### Collections
1. **rules**: Security testing rule definitions with transform, match, and report sections
2. **integrations**: Postman API connections with user metadata
3. **raw_requests**: Original API requests from Postman
4. **raw_environments**: Postman environment configurations
5. **scans**: Security scan sessions
6. **transformedrequests**: Modified requests for testing (persistent storage)
7. **vulnerabilities**: Detected security issues

### Relationships
- Integration → Raw Requests (1:N)
- Integration → Raw Environments (1:N)
- Workspace → Raw Environments (1:N)
- Scan → Transformed Requests (1:N)
- Scan → Vulnerabilities (1:N)
- Rule + Request → Transformed Request
- Transformed Request → Vulnerability (0:1)
- Rule → Vulnerability (for report template)

## Future Enhancements

### Planned Features
1. JWT-based authentication system
2. Real-time scan progress via WebSockets
3. Custom rule builder UI
4. Automated regression testing
5. Integration with CI/CD pipelines
6. Advanced reporting and analytics
7. Environment variable substitution in scans

### Scalability Considerations
1. Horizontal scaling of workers
2. MongoDB sharding for large datasets
3. Redis caching for frequently accessed data
4. CDN for static report assets
5. Load balancing for API servers

## Development Guidelines

### Code Style
- ES6 modules with named exports
- Async/await for asynchronous operations
- Class-based architecture with method binding
- Comprehensive error handling
- Input validation on all endpoints
- Consistent naming conventions

### Best Practices
1. Services handle business logic, controllers handle HTTP
2. All errors thrown as ApiError instances
3. Database queries use lean() for performance
4. Validation middleware for request validation
5. Search routes must precede parameterized routes
6. Pagination on all list endpoints

### Controller Pattern
```javascript
class ResourceController {
  constructor() {
    // Bind all methods
    this.getAll = this.getAll.bind(this);
    this.get = this.get.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
  }
}
```

### Service Pattern
```javascript
class ResourceService {
  async create(data) {
    // Business logic
    // Database operations
    // Return result
  }
}
```

### Error Handling Pattern
- Use ApiError class for all errors
- Include proper HTTP status codes
- Provide meaningful error messages
- Log errors appropriately

### Validation Middleware
- Use validation middleware for all input
- Validate request body, params, and query
- Return standardized validation errors
- Sanitize inputs to prevent injection attacks

Please acknowledge that you understand these requirements and wait for my specific request before providing any code.