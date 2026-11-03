import mongoose, { Schema } from "mongoose";

const orderbookSchema = new Schema(
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

orderbookSchema.index({ marketId: 1, outcome: 1 }, { unique: true });

export const Orderbook = mongoose.model("Orderbook", orderbookSchema);
