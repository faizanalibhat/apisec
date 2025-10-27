import mongoose from "mongoose";

const AUTH_TYPES = ["basic", "bearer", "jwt", "api_key"];


const customHeadersSchema = new mongoose.Schema({
    key: { type: String, required: true },
    value: { type: String, required: true },
}, { _id: false });


const schema = new mongoose.Schema({
    orgId: { type: String, required: true },
    name: { type: String, required: true },
    authType: { type: String, enum: AUTH_TYPES, required: true },
    authValue: { type: String, required: true },
    customHeaders: { type: [customHeadersSchema], default: [] },
}, { timestamps: true });

const AuthProfile = mongoose.model("auth_profiles", schema);

export { AuthProfile, AUTH_TYPES };