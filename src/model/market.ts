import mongoose, { Schema } from "mongoose";

export const marketSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        creatorId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "User",
        },
        totalIssued: {
            type: Number,
            required: true,
            default: 0,
        },
        expiry: {
            type: Date,
            required: true,
        },
        resolution: {
            type: String,
            enum: ["yes", "no", null],
            default: null,
        },
        matchingVersion: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    },
);
export const Market = mongoose.model("Market", marketSchema);
