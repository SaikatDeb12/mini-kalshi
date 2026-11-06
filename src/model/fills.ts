import mongoose, { Schema } from "mongoose";

const fillSchema = new Schema(
    {
        makerOrderId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "Order",
        },
        takerOrderId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "Order",
        },
        makerPrice: {
            type: Number,
            required: true,
        },
        takerPrice: {
            type: Number,
            required: true,
        },
        marketId: {
            type: Schema.Types.ObjectId,
            ref: "Market",
            required: true,
        },
        matchType: {
            type: String,
            enum: ["transfer", "mint"],
            required: true,
        },
        qty: {
            type: Number,
            required: true,
        },
    },
    { timestamps: true },
);

export const Fill = mongoose.model("Fill", fillSchema);
