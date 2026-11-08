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
        },
        orderId: {
            type: Schema.Types.ObjectId,
            ref: "Order",
        },
        fillId: {
            type: Schema.Types.ObjectId,
            ref: "Fill",
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
                "merge",
                "refund",
                "cancel",
                "settle",
            ],
            required: true,
        },
        qtyChange: {
            type: Number,
            default: 0,
        },
        lockedQtyChange: {
            type: Number,
            default: 0,
        },
        balanceUSDChange: {
            type: Number,
            default: 0,
        },
        lockedUSDChange: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true },
);

export const Log = mongoose.model("Log", txLogsSchema);
