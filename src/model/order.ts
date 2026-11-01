import mongoose, { Schema } from "mongoose";
const orderSchema = new Schema(
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
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        remainingQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ["open", "partial", "filled", "cancelled"],
            default: "open",
        },
    },
    { timestamps: true },
);

export const Order = mongoose.model("Order", orderSchema);
