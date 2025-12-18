
export const NotificationTemplates = {
    /**
     * @param {string} userName
     */
    suppressionRuleCreated: (userName) => {
        return `<a target="_blank" href="auth.user.id"><span class="font-bold">${userName}</span></a> <span class=" !text-secondary-foreground !font-medium"> created a suppression rule triggered by </span> <span class="font-medium text-primary" href="apisec.vulnerabilities">vulnerability</span>`;
    },

    /**
     * @param {string} userName
     * @param {string} vulnerabilityId
     */
    vulnerabilityFalsePositive: (userName, vulnerabilityId) => {
        return `<a target="_blank" href="auth.user.id"><span class="font-bold">${userName}</span></a> <span class=" !text-secondary-foreground !font-medium"> marked a </span> <a class="font-medium text-primary" href="apisec.vulnerabilities">vulnerability</a> <span class=" !text-secondary-foreground !font-medium"> as false positive </span>`;
    },

    /**
     * @param {string} scanName
     * @param {string} scanId
     */
    scanCompleted: (scanName, scanId) => {
        return `<a class="font-medium text-primary" href="apisec.scans">${scanName}</a> <span class=" !text-secondary-foreground !font-medium"> completed </span>`;
    },

    /**
     * @param {string} scanName
     * @param {string} scanId
     */
    scanFailed: (scanName, scanId) => {
        return `<a class="font-medium text-primary" href="apisec.scans">${scanName}</a> <span class=" !text-secondary-foreground !font-medium"> failed </span>`;
    }
}
