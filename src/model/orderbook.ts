import mongoose, { Schema } from "mongoose";

const orderbookModel = new Schema(
    {
        outcome: {
            type: String,
            enum: ["yes", "no"],
            required: true,
        },
        marketId: {
            type: Schema.Types.ObjectId,
            ref: "Market",
            required: true,
        },
    },
    { timestamps: true },
);

export const Order = mongoose.model("Order", orderbookModel);
