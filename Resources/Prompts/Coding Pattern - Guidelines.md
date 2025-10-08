# Development Guidelines

## 📂 Repository Structure
```
project-root/
├── controllers/         # HTTP request handlers
├── services/           # Business logic layer
├── routes/             # API route definitions
├── models/             # Database schemas
├── middleware/         # Express middleware
├── utils/              # Utility classes (ApiResponse, ApiError)
├── workers/            # Background jobs
├── db/                 # Database configuration
├── app.js              # Express app setup
└── env.js              # Environment configuration
```

## 📄 File Naming Patterns

### Use kebab-case with descriptive suffixes:
- **Controllers**: `resource.controller.js`
- **Services**: `resource.service.js`
- **Routes**: `resource.routes.js`
- **Models**: `resource.model.js`
- **Middleware**: `descriptiveName.middleware.js`
- **Workers**: `taskName.worker.js`
- **Utilities**: `ClassName.js` (PascalCase for classes)

### Examples:
```
✅ rule.controller.js
✅ integration.service.js
✅ scan.routes.js
✅ vulnerability.model.js
✅ apiResponse.middleware.js
✅ scan.worker.js
✅ ApiError.js

❌ ruleController.js
❌ RuleController.js
❌ rule-controller.js
```

## 🔗 URL Patterns

### Use kebab-case for all URL paths:
```javascript
✅ /api/v1/raw-request
✅ /api/v1/integration
✅ /api/v1/scan-result

❌ /api/v1/rawRequest
❌ /api/v1/raw_request
❌ /api/v1/RawRequest
```

### RESTful endpoints structure:
```javascript
GET    /api/v1/resource          // Get all resources
POST   /api/v1/resource          // Create new resource
GET    /api/v1/resource/:id      // Get single resource
PUT    /api/v1/resource/:id      // Update resource
DELETE /api/v1/resource/:id      // Delete resource

// Special endpoints come before CRUD
GET    /api/v1/resource/search   // Search resources
GET    /api/v1/resource/stats    // Get statistics
POST   /api/v1/resource/bulk     // Bulk operations
```

## 📤 Export Patterns

### Always export at the end of the file:

**✅ Controllers - Export destructured methods:**
```javascript
class ResourceController {
    constructor() {
        this.service = new ResourceService();
        // Bind all methods
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
    }

    async create(req, res, next) { /* ... */ }
    async getAll(req, res, next) { /* ... */ }
}

// Create instance and export methods at the end
const controller = new ResourceController();
export const {
    create,
    getAll
} = controller;
```

**✅ Services - Export class:**
```javascript
class ResourceService {
    async create(data) { /* ... */ }
    async findAll(filters) { /* ... */ }
}

// Export class at the end
export { ResourceService };
```

**✅ Routes - Export router:**
```javascript
import express from 'express';
import * as controller from '../controllers/resource.controller.js';

const router = express.Router();

router.get('/', controller.getAll);
router.post('/', controller.create);

// Export router at the end
export default router;
```

**✅ Models - Export model:**
```javascript
import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
    // schema definition
});

// Export model at the end
const Resource = mongoose.model('Resource', resourceSchema);
export default Resource;
```

**✅ Utils - Export class or functions:**
```javascript
class ApiResponse {
    static success(message, data) { /* ... */ }
    static error(message, errors) { /* ... */ }
}

// Export at the end
export { ApiResponse };
```

### ❌ Avoid:
```javascript
// Don't export inline
export class ResourceService { }

// Don't export with function declaration
export async function createResource() { }

// Don't mix exports
export { something };
// ... more code ...
export default somethingElse;
```

## 🎯 Import Patterns

### Order imports by category:
```javascript
// 1. External packages
import express from 'express';
import mongoose from 'mongoose';

// 2. Internal modules (use relative paths)
import { ResourceService } from '../services/resource.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

// 3. Models
import Resource from '../models/resource.model.js';
```

## 📋 Additional Conventions

### Class Names: PascalCase
```javascript
class ResourceController { }
class ApiError { }
class RuleService { }
```

### Method Names: camelCase
```javascript
async createResource() { }
async getAllResources() { }
async searchByName() { }
```

### Variable Names: camelCase
```javascript
const organizationId = req.organizationId;
const searchQuery = req.query.q;
const pageNumber = parseInt(page);
```

### Constants: UPPER_SNAKE_CASE
```javascript
const DEFAULT_PAGE_SIZE = 20;
const MAX_RETRY_ATTEMPTS = 3;
const API_VERSION = 'v1';
```