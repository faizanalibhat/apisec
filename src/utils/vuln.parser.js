export function vulnParser(vuln){

    return {
        orgId: vuln.orgId,
        title: vuln.title,
        assessmentId: vuln.assessmentId,
        description: vuln.description,
        stepsToReproduce: vuln.stepsToReproduce || 'No steps provided',
        impact: vuln.impact || 'No impact provided',
        cvssScore: vuln?.cvssScore,
        cvssString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N',
        state: "In Review",
        affectedAssets: [{
            value: vuln?.transformedRequestId?.url,
            type: "api",
            vulnerableLocation: vuln?.transformedRequestId?.url
        }],
        reportOrigin: "apisec-import",
        references: [],
        vulnerableComponent: {
            name: vuln.requestId?.name,
            type: 'api',
            value: vuln.requestId?.url
        },
        solution: vuln?.remediation,
        cwe: vuln.cwe,
        universalVulnId: vuln?.universalVulnId,
        _raw: vuln,
        asset: vuln.transformedRequestId
    };
}