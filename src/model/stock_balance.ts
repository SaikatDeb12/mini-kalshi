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
        side: {
            type: String,
            enum: ["buy", "sell"],
            required: true,
        },
        price: {
            type: Number,
            required: true,
        },
        qty: {
            type: Number,
            required: true,
        },
        lockedQty: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

export const Stock = mongoose.model("Stock", stockBalance);
