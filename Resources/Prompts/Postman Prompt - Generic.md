Please create a Postman collection JSON with the following specifications:

**Collection Structure:**
- Main collection name: "Fruits"
- No scripts or variables at the collection level
- Contains a folder named {CurrentResource} Routes

**Resource Folder Requirements:**
- Include a folder-level script that:
  - Saves newly created Resource to the environment variables
  - Clears environment variable values by setting them to empty strings (e.g., `pm.environment.set('resourceId', "");`) when a resource is deleted
  
**Endpoint Configuration:**
- All URLs should use: `{{base_url}}/endpoint-path`. Value of `base_url` is `http://localhost:9040/api/v1`
- All requests must include the header: `Authorization: Bearer {{access_token}}`
- Use path variables for dynamic IDs (e.g., `{{base_url}}/item/:itemId}`)
- Do not hardcode any IDs in the URLs

Please provide the complete Postman collection JSON export that meets these requirements.