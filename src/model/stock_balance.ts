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
            min: 1,
            max: 99,
        },
        qty: {
            type: Number,
            required: true,
            min: 1,
        },
        lockedQty: {
            type: Number,
            required: true,
            min: 1,
        },
    },
    {
        timestamps: true,
    },
);

export const Stock = mongoose.model("Stock", stockBalance);
