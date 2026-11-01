import mongoose, { Schema } from "mongoose";

export const stockBalance = new Schema(
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
    },
    {
        timestamps: true,
    },
);

export const Stock = mongoose.model("Stock", stockBalance);
