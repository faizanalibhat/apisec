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
   Postman API Key → Import Workspaces → Select Collections → Store Raw Requests

2. Configuration Phase:
   Create Security Rules (transformations + match criteria)

3. Execution Phase:
   Create Scan → Queue to RabbitMQ → Transform Requests → Execute → Match Responses

4. Analysis Phase:
   Generate Vulnerabilities → Update Scan Results → Create Reports
```

## Key Architectural Decisions

1. **No Base Classes**: Each controller and service is independent
2. **Service Layer Pattern**: Business logic in services, controllers handle HTTP only
3. **Asynchronous Processing**: RabbitMQ for scan execution
4. **Global Error Handling**: Centralized error transformation
5. **Standardized Responses**: ApiResponse class for consistency
6. **Organization Isolation**: req.orgId (temporary, will use JWT later)

## Data Flow Architecture

### Synchronous Flow (API Requests)
```
Client Request → Router → Controller → Service → Database
                                         ↓
Client Response ← Middleware ← Controller ← Service Response
```

### Asynchronous Flow (Scan Processing)
```
Scan Creation → RabbitMQ Queue → Worker (Transformation)
                                    ↓
                              Transform Requests
                                    ↓
                              Queue Next Stage
                                    ↓
                              Worker (Execution)
                                    ↓
                              Execute & Match
                                    ↓
                              Create Vulnerabilities
```

## Completed Modules

### 1. Rules Module ✅
- **Model**: Security test rules with transformations and match criteria
- **Features**: CRUD operations, text search, YAML-based rule definitions
- **Transformations**: Headers, cookies, parameters, host override, method changes
- **Matching**: Status codes, response body, headers, content type, response time

### 2. Integration Module ✅
- **Model**: Postman API integrations with encrypted keys
- **Features**: Multiple integrations per organization, workspace selection
- **Security**: AES-256-GCM encryption for API keys
- **Utilities**: Rate-limited Postman client, collection parser

### 3. Raw Request Module ✅
- **Model**: Individual API requests from Postman
- **Features**: CRUD, bulk operations, edit tracking, search and filters
- **Data**: Complete request context including collection metadata

### 4. Scan Module ✅
- **Model**: Security scan sessions with findings and statistics
- **Features**: Asynchronous execution, progress tracking, vulnerability summary
- **Integration**: RabbitMQ for distributed processing

### 5. Vulnerability Module ✅
- **Model**: Detailed vulnerability records with evidence
- **Features**: CRUD, status management, notes, false positive marking
- **Evidence**: Full request/response pairs with transformation details
- **Export**: JSON and CSV formats

### 6. Transformed Request Module ✅
- **Model**: Requests after rule transformations applied
- **Purpose**: Intermediate storage during scan execution
- **Tracking**: Execution state and results

## Engine Architecture

### Components
1. **Transformer**: Applies rule transformations to requests
2. **Sender**: Executes HTTP requests with timeout handling
3. **Matcher**: Analyzes responses against rule criteria
4. **Engine Service**: Orchestrates the transformation-execution-matching flow

### Transformation Capabilities
- Header manipulation (add, remove, modify)
- Cookie operations
- URL parameter modifications
- Host override
- Method changes
- Request body modifications

### Matching Criteria
- HTTP status codes
- Response body content (string matching, regex)
- Header presence and values
- Content-Type validation
- Response size constraints
- Response time thresholds

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
   - Creates transformed request documents
   - Publishes to execution queue

2. **Execution Worker**:
   - Receives scan execution events
   - Executes transformed requests
   - Matches responses against rules
   - Creates vulnerability records
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
1. **rules**: Security testing rule definitions
2. **integrations**: Postman API connections
3. **rawrequests**: Original API requests
4. **scans**: Security scan sessions
5. **transformedrequests**: Modified requests for testing
6. **vulnerabilities**: Detected security issues

### Relationships
- Integration → Raw Requests (1:N)
- Scan → Transformed Requests (1:N)
- Scan → Vulnerabilities (1:N)
- Rule + Request → Transformed Request
- Transformed Request → Vulnerability (1:1)

## Future Enhancements

### Planned Features
1. JWT-based authentication system
2. Real-time scan progress via WebSockets
3. Custom rule builder UI
4. Automated regression testing
5. Integration with CI/CD pipelines
6. Advanced reporting and analytics

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

Please acknowledge that you understand these requirements and wait for my specific request before providing any code.