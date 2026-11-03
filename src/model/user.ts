import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: [true, "username is required"],
            unique: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        availableUSD: {
            type: Number,
            default: 0,
        },
        lockedUSD: {
            type: Number,
            default: 0,
        },
        matchedCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    },
);

export const User = mongoose.model("User", userSchema);
