const axios = require('axios')


const vmApi = axios.create({
    baseURL: process.env.VM_SERVICE_URL + '/api',
    headers: {
        'service-api-key': process.env.SERVICE_KEY
    }
});


class VmAPI {

    static async importVulns({ vulns, assessmentId }) {
        try {
            const response = await vmApi.post(`/import/vulns/${assessmentId}`, { vulns: vulns }, { validateStatus: () => true });

            if (response != 200) {
                console.log(response?.data);
                return { status: "failed", message: "Failed to import exposures to vm" };
            }

            return response.data;
        }
        catch(error) {
            console.log(error);
            return { code: 500, status: 'failed', message: "failed to import vulns" };
        }
    }

}


module.exports = { VmAPI };