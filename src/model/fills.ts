import mongoose, { Schema } from "mongoose";

const fillsModel = new Schema(
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
        },
        matchType: {
            type: String,
            enum: ["transfer", "mint"],
        },
        qty: {
            type: Number,
            required: true,
        },
    },
    { timestamps: true },
);

export const Fill = mongoose.model("Fill", fillsModel);
