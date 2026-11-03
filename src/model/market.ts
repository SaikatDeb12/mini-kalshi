import mongoose, { Schema } from "mongoose";

export const marketSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        creatorId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "User",
        },
        totalIssued: {
            type: Number,
            required: true,
            default: 0,
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
        matchingVersion: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    },
);
export const Market = mongoose.model("Market", marketSchema);

// export const marketModel = new Schema(
//     {
//         title: {
//             type: String,
//             required: true,
//         },
//         initialWager: {
//             type: Number,
//             required: true,
//         },
//         side: {
//             type: String,
//             enum: ["yes", "no"],
//             required: true,
//         },
//         creatorId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "User",
//             required: true,
//         },
//         expiry: {
//             type: Date,
//             required: true,
//         },
//         resolution: {
//             type: String,
//             enum: ["yes", "no", null],
//             default: null,
//         },
//     },
//     {
//         timestamps: true,
//     },
// );
