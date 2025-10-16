import mongoose from "mongoose";


const ownerSchema = new mongoose.Schema({
    name: String,
    email: String,
    userId: String,
    role: { type: String, enum: ["member", "admin", "owner"], default: "member" },
}, { _id: false });


const schema = new mongoose.Schema({
    orgId: { type: String, required: true },

    name: { type: String, required: true },
    description: { type: String },

    collaborators: { type: [ownerSchema], default: [] },

    collectionUids: { type: [String], default: [] },

}, { timestamps: true });


const Projects = mongoose.model("projects", schema);

export { Projects };