import mongoose, { Schema } from "mongoose";

const UserModel = new Schema(
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
        balance: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    },
);

export const User = mongoose.model("User", UserModel);
