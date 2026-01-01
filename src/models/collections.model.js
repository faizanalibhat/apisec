import { Schema, model } from "mongoose";


const schema = new Schema({

    orgId: { type: String, required: true },

    name: { type: String },
    integration_id: { type: Schema.Types.ObjectId, ref: 'Integration' },
    postman_url: { type: String },

    collection_uid: { type: String },

}, { timestamps: true, strict: false });


export const Collections = model("collections", schema);