import { Collections } from "../../models/collections.model.js";
import RawRequest from "../../models/rawRequest.model.js";
import RawEnvironment from "../../models/rawEnvironment.model.js";

import {
  substituteUrlVariables,
  substituteNonUrlVariables,
} from "../../utils/variableSubstitution.js";

export async function getProcessedCollectionRequests({ project }) {
  const collection = await Collections.findOne({
    orgId: project.orgId,
    collection_uid: { $in: project.configuration.collection_uids },
  });

  if (!collection) {
    throw new Error("Collection not found");
  }

  const requests = await RawRequest.find({
    orgId: project.orgId,
    collectionUid: collection.collection_uid,
  }).lean();

  console.log("[+] TOTAL REQUESTS: ", requests.length);

  // resolve env vars in the requests using the environment variables of the project
  const environmentId = project.configuration.environment_id;
  const environmentVariables = {};

  if (environmentId) {
    const environment = await RawEnvironment.findById(environmentId).lean();

    if (environment) {
      environment.values
        .filter((v) => v.key)
        .forEach((v) => {
          environmentVariables[v.key] = v.value;
        });

      console.log(
        `[+] Loaded ${Object.keys(environmentVariables).length} environment variables`,
      );
    }
  }

  const processed_requests = [];

  for (let request of requests) {
    const urlResolvedRequest = substituteUrlVariables(
      request,
      environmentVariables,
    );
    const nonUrlResolvedRequest = substituteNonUrlVariables(
      urlResolvedRequest,
      environmentVariables,
    );

    console.log("Processed the request : ", request.url);

    processed_requests.push(nonUrlResolvedRequest);
  }

  console.log("[+] TOTAL PROCESSED REQUESTS: ", processed_requests.length);

  return processed_requests;
}
