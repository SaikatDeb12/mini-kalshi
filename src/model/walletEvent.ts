import mongoose, { Schema } from "mongoose";

const walletEventModel = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    tx_type: {
        type: String,
        enum: ["onramp", "created", "bet", "payout", "refund"],
        required: true,
    },
    externalId: {
        type: mongoose.Schema.Types.Mixed,
    },
    amount: {
        type: Number,
        required: true,
    },
});

export const Wallet = mongoose.model("Wallet", walletEventModel);
