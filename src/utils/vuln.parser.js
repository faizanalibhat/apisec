export function vulnParser(vuln) {

    const evidence = vuln.evidence || {};
    const request = evidence.request || {};
    const response = evidence.response || {};
    const requestSnapshot = vuln.requestSnapshot || {};
    const ruleSnapshot = vuln.ruleSnapshot || {};
    const cvss = vuln.cvss || {};

    const fullMarkdownReport = `
# ${vuln.title}

**${vuln.description}**

---

### Details

| Severity | CVSS Score | CWE | OWASP |
| :--- | :--- | :--- | :--- |
| **${vuln.severity}** | ${cvss.score || 'N/A'} | ${vuln.cwe || 'N/A'} | ${vuln.owasp || 'N/A'} |

---

### Steps to Reproduce

${vuln.stepsToReproduce || 'No steps provided.'}

---

### Impact

${vuln.impact || 'No impact provided.'}

---

### Remediation

${vuln.remediation || 'No remediation provided.'}

---

### Evidence

#### Request

\`\`\`http
${request.method} ${request.url}
${Object.entries(request.headers || {}).map(([key, value]) => `${key}: ${value}`).join('\n')}

${request.body ? JSON.stringify(request.body, null, 2) : ''}
\`\`\`

#### Response

\`\`\`http
HTTP/1.1 ${response.status} ${response.statusText}
${Object.entries(response.headers || {}).map(([key, value]) => `${key}: ${value}`).join('\n')}

${response.body ? JSON.stringify(response.body, null, 2) : ''}
\`\`\`

---

### Additional Context

**Original Request:**
*   **Name:** ${requestSnapshot.name}
*   **URL:** ${requestSnapshot.method} ${requestSnapshot.url}
*   **Collection:** ${requestSnapshot.collectionName}

**Detection Rule:**
*   **Name:** ${ruleSnapshot.rule_name}

**Rule Snapshot:**
\`\`\`json
${JSON.stringify(ruleSnapshot, null, 2)}
\`\`\`
`;

    return {
        orgId: vuln.orgId,
        title: vuln.title,
        assessmentId: vuln.assessmentId,
        description: vuln.description,
        fullMarkdownReport,
        stepsToReproduce: vuln.stepsToReproduce || 'No steps provided',
        impact: vuln.impact || 'No impact provided',
        cvssScore: cvss.score || '0',
        cvssString: cvss.vector || 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N',
        state: "In Review",
        affectedAssets: [{
            value: vuln?.transformedRequestSnapshot?.url,
            type: "api",
            vulnerableLocation: vuln?.transformedRequestSnapshot?.url
        }],
        reportOrigin: "apisec-import",
        references: [],
        vulnerableComponent: {
            name: requestSnapshot?.name,
            type: 'api',
            value: requestSnapshot?.url
        },
        solution: vuln?.remediation,
        cwe: vuln.cwe,
        universalVulnId: vuln?.universalVulnId,
        _raw: vuln,
        asset: { value: vuln.transformedRequestSnapshot?.url, type: "api", name: vuln.transformedRequestSnapshot?.name }
    };
}