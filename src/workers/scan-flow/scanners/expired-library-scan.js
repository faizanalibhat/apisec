export async function expiredLibraryScan({ request, response }) {

    // Default Request Object (based on RawRequest model)
    const defaultRequest = {
        method: "GET",
        url: "https://example.com/api/v1/users",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer token123",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        params: {
            "id": "123",
            "include": "profile"
        },
        body: null,
        mode: "raw",
        body_format: "json",
        rawHttp: "GET /api/v1/users?id=123&include=profile HTTP/1.1\r\nHost: example.com\r\nContent-Type: application/json\r\nAuthorization: Bearer token123\r\n\r\n",
        source: "crawler",
        orgId: "org_123",
        projectIds: ["project_456"]
    };

    // Default Response Object
    const defaultResponse = {
        status: 200,
        statusText: "OK",
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Server": "nginx",
            "X-Powered-By": "Express"
        },
        body: {
            content: JSON.stringify({
                status: "success",
                data: {
                    id: 123,
                    username: "testuser",
                    email: "test@example.com"
                }
            }),
            mode: "raw",
            format: "json"
        },
        size: 1024,
        time: 150 // response time in ms
    };

    // Use provided request/response or defaults
    const req = request || defaultRequest;
    const res = response || defaultResponse;

    // do your scanning logic here
    // Example: Check for specific headers or body content

    const vuln = {
        title: "Prototype Pollution via JSON Payload",
        description: "The application fails to properly validate and sanitize JSON input, allowing attackers to pollute the prototype of base objects through specially crafted payloads. This can lead to various attacks including denial of service, remote code execution, or privilege escalation.",
        severity: "high",
        type: "prototype-pollution",
        cwe: "CWE-1321",
        cvssScore: "8.9",
        tags: ["prototype-pollution", "javascript", "json", "object-injection"],
        stepsToReproduce: "1. Identify an endpoint that accepts JSON payloads\n2. Send a POST request with the payload: {\"__proto__\": {\"polluted\": \"yes\"}}\n3. Verify pollution by checking if Object.prototype.polluted returns 'yes'\n4. Test impact by polluting dangerous properties like toString, valueOf, or constructor",
        mitigation: "1. Use Object.create(null) for objects that should not have prototypes\n2. Implement JSON schema validation to reject unexpected properties\n3. Use libraries like 'lodash' safely (avoid _.merge, _.cloneDeep with untrusted data)\n4. Freeze critical prototypes: Object.freeze(Object.prototype)\n5. Validate input and reject payloads containing __proto__ or constructor properties",
        impact: "Prototype pollution can lead to:\n- Remote Code Execution in some JavaScript environments\n- Denial of Service by corrupting application logic\n- Bypassing security controls\n- Information disclosure",
        remediation: "Implement strict input validation using JSON schema validation libraries. Use safe object merging techniques and consider using Maps instead of plain objects for user-controlled data."
    }

    return vuln;
}