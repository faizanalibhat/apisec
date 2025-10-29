export function vulnParser(vuln){

    return {
        orgId: vuln.orgId,
        title: vuln.title,
        assessmentId: vuln.assessmentId,
        description: vuln.description,
        fullMarkdownReport: `# ${vuln.title}
#### ${vuln.description}
## Steps To Reproduce
${vuln.stepsToReproduce}
## Impact
${vuln.impact}
        `,
        stepsToReproduce: vuln.stepsToReproduce || 'No steps provided',
        impact: vuln.impact || 'No impact provided',
        cvssScore: vuln?.cvssScore || '0',
        cvssString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N',
        state: "In Review",
        affectedAssets: [{
            value: vuln?.transformedRequestSnapshot?.url,
            type: "api",
            vulnerableLocation: vuln?.transformedRequestSnapshot?.url
        }],
        reportOrigin: "apisec-import",
        references: [],
        vulnerableComponent: {
            name: vuln.requestSnapshot?.name,
            type: 'api',
            value: vuln.requestSnapshot?.url
        },
        solution: vuln?.remediation,
        cwe: vuln.cwe,
        universalVulnId: vuln?.universalVulnId,
        _raw: vuln,
        asset: { value: vuln.transformedRequestSnapshot?.url, type: "api", name: vuln.transformedRequestSnapshot?.name }
    };
}