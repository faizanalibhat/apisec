
export const NotificationTemplates = {
    /**
     * @param {string} userName
     */
    suppressionRuleCreated: (userName) => {
        return `<a target="_blank" href="/user/settings"><span class="font-bold">${userName}</span></a> <span class=" !text-secondary-foreground !font-medium"> created a suppression rule </span> <a class="font-medium text-primary" href="/vulnerabilities?suppressed=true">View Suppressed</a>`;
    },

    /**
     * @param {string} userName
     * @param {string} vulnerabilityId
     */
    vulnerabilityFalsePositive: (userName, vulnerabilityId) => {
        return `<a target="_blank" href="/user/settings"><span class="font-bold">${userName}</span></a> <span class=" !text-secondary-foreground !font-medium"> marked a vulnerability as false positive </span> <a class="font-medium text-primary" href="/vulnerabilities/${vulnerabilityId}">View Details</a>`;
    },

    /**
     * @param {string} scanName
     * @param {string} scanId
     */
    scanCompleted: (scanName, scanId) => {
        return `<span class=" !text-secondary-foreground !font-medium">Scan "${scanName}" has completed </span> <a class="font-medium text-primary" href="/scans/${scanId}/results">View Results</a>`;
    },

    /**
     * @param {string} scanName
     * @param {string} scanId
     */
    scanFailed: (scanName, scanId) => {
        return `<span class=" !text-secondary-foreground !font-medium">Scan "${scanName}" has failed </span> <a class="font-medium text-primary" href="/scans/${scanId}">View Details</a>`;
    }
}
