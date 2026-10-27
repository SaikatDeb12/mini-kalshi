import mongoose, { Schema } from "mongoose";

export const MarketModel = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        initialWager: {
            type: Number,
            required: true,
        },
        side: {
            type: String,
            enum: ["yes", "no"],
            required: true,
        },
        creatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        expiry: {
            type: Date,
            required: true,
        },
        resolution: {
            type: String,
            enum: ["yes", "no", null],
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

export const Market = mongoose.model("Market", MarketModel);
