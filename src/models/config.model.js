import mongoose from "mongoose";


const schema = new mongoose.Schema({
    orgId: { type: String, required: true },
    assessmentId: { type: String, required: false }
}, { timestamps: true });


const Config = mongoose.model("configs", schema);

export { Config };