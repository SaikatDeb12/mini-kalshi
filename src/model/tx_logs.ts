import mongoose, { Schema } from "mongoose";

const txLogsSchema = new Schema(
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
        orderId: {
            type: Schema.Types.ObjectId,
            ref: "Order",
            required: true,
        },
        fillId: {
            type: Schema.Types.ObjectId,
            ref: "Fill",
            required: false,
        },
        outcome: {
            type: String,
            enum: ["yes", "no", null],
            default: null,
        },
        action: {
            type: String,
            enum: [
                "onramp",
                "buy",
                "sell",
                "lock",
                "unlock",
                "split",
                "refund",
                "cancel",
            ],
            required: true,
        },
        qtyChange: {
            type: Number,
        },
        lockedQtyChange: {
            type: Number,
        },
        balanceUSDChange: {
            type: Number,
        },
        lockedUSDChange: {
            type: Number,
        },
    },
    { timestamps: true },
);

export const Log = mongoose.model("Log", txLogsSchema);
