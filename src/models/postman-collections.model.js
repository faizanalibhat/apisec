import { Schema, model } from "mongoose";


const schema = new Schema({

    orgId: { type: String, required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: 'Integration' },
    workspaceId: { type: String },
    collectionUid: { type: String },
    name: { type: String },
    postmanUrl: { type: String },
    requestIds: { type: [Schema.Types.ObjectId], ref: 'RawRequest', default: [] },

    projectIds: { type: [Schema.Types.ObjectId], ref: "projects",  default: [] }

}, { timestamps: true, strict: false });


export const PostmanCollections = model("postmancollections", schema);