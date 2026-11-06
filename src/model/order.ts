import mongoose, { Schema } from "mongoose";
const orderSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        orderbookId: {
            type: Schema.Types.ObjectId,
            ref: "Orderbook",
            required: true,
        },
        type: {
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

orderSchema.index({
    orderbookId: 1,
    type: 1,
    status: 1,
    price: 1,
    createdAt: 1,
});

export const Order = mongoose.model("Order", orderSchema);
