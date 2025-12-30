import mongoose from "mongoose";

/**
 * Cookie schema aligned with Playwright + browser specs
 */
const CookieSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    value: { type: String, required: true },

    domain: { type: String, required: true },
    path: { type: String, default: "/" },

    expires: { type: Number }, // unix timestamp (seconds)
    httpOnly: { type: Boolean, default: false },
    secure: { type: Boolean, default: false },
    sameSite: {
      type: String,
      enum: ["Strict", "Lax", "None"],
      default: "Lax"
    }
  },
  { _id: false }
);


const CrawlerAuthContextSchema = new mongoose.Schema(
  {
    orgId: {
      type: String,
      required: true,
      index: true
    },

    scanId: {
      type: String,
      required: true,
      index: true
    },

    origin: {
      type: String,
      required: true
    },

    cookies: {
      type: [CookieSchema],
      default: []
    },

    headers: {
      type: Map,
      of: String,
      default: {}
    },

    storage: {
      localStorage: {
        type: Map,
        of: String,
        default: {}
      },
      sessionStorage: {
        type: Map,
        of: String,
        default: {}
      }
    },

    userAgent: {
      type: String
    },

    authenticatedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }
    }
  },
  {
    versionKey: false,
    timestamps: true
  }
);

const CrawlerAuthContext = mongoose.model(
  "CrawlerAuthContext",
  CrawlerAuthContextSchema
);

export { CrawlerAuthContext };