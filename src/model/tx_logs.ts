import mongoose, { Schema } from "mongoose";

const txLogsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
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
        enum: ["onramp", "buy", "sell", "split", "refund", "cancel"],
        required: true,
    },
    qtyChange: {
        type: Number,
    },
    availableUSDChange: {
        type: Number,
    },
});

export const Log = mongoose.model("Log", txLogsSchema);
