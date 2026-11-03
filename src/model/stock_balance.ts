import mongoose, { Schema } from "mongoose";

export const stockSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        marketId: {
            type: Schema.Types.ObjectId,
            ref: "Market",
            required: true,
        },
        outcome: {
            type: String,
            enum: ["yes", "no"],
            required: true,
        },
        qty: {
            type: Number,
            required: true,
            default: 0,
        },
        lockedQty: {
            type: Number,
            required: true,
            default: 0,
        },
        matchedCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    },
);
stockSchema.index({ userId: 1, marketId: 1, outcome: 1 }, { unique: true });
export const Stock = mongoose.model("Stock", stockSchema);
