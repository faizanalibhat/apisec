import { Connector } from "../../../integrations/connectors/connector.js";

import RawRequest from "../../../models/rawRequest.model.js";
import RawEnvironment from "../../../models/rawEnvironment.model.js";
import { Collections } from "../../../models/collections.model.js";

import { Integration } from "../../../models/integration.model.js";


export async function handleRefreshIntegration(payload, msg, channel) {

    const { integration } = payload;

    const orgId = integration.orgId;

    try {
        console.log("[+] REFRESHING INTEGRATION ", integration.type);

        const requests = await Connector.getRequests(integration.type, { integration });

        const environments = await Connector.getEnvironments(integration.type, { integration });

        const collections = await Connector.getCollections(integration.type, { integration });

        console.log("[+] TOTAL REQUESTS : ", requests.length);
        console.log("[+] TOTAL ENVIRONMENTS : ", environments.length);
        console.log("[+] TOTAL COLLECTIONS : ", collections.length);

        // upsert instead of creating new
        await RawRequest.bulkWrite(requests.map(req => ({
            updateOne: {
                filter: { orgId, method: req.method, url: req.url },
                update: req,
                upsert: true
            }
        })));

        await RawEnvironment.bulkWrite(environments.map(env => ({
            updateOne: {
                filter: { orgId, name: env.name, integration_id: integration._id },
                update: env,
                upsert: true
            }
        })));

        await Collections.bulkWrite(collections.map(coll => ({
            updateOne: {
                filter: { orgId, collection_uid: coll.collection_uid, integration_id: integration._id },
                update: coll,
                upsert: true
            }
        })));

        // set status complete
        await Integration.updateOne({ _id: integration._id }, { status: 'installed' });
    }
    catch(err) {
        console.log(err);
        await Integration.updateOne({ _id: integration._id }, { status: 'failed' });
    }
    finally {
        channel.ack(msg);
    }

}