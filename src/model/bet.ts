import mongoose, { Schema } from "mongoose";

const betSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    marketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Market",
        required: true,
    },
    betAmount: {
        type: Number,
        required: true,
    },
});

export const Bet = mongoose.model("Bet", betSchema);
