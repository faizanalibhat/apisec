import { Schema, model } from "mongoose";


const schema = new Schema({
    integrationIds: { type: [Schema.Types.ObjectId], default: [] },
}, { timestamps: true, strict: false });


export const Environment = model("environment", schema);