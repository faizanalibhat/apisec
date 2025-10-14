import mongoose from "mongoose";


const schema = new mongoose.Schema({
    orgId: { type: String, required: true },
    requestId: { type: String, required: true },
    ruleId: { type: String, required: true },
}, { timestamps: true });


const Supression = mongoose.model("suppression_rules", schema);

export { Supression };