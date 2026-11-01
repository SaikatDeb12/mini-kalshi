import type { Request, Response } from "express";
import { onRampSchema, signInSchema, signUpSchema } from "../types/auth";
import { User } from "../model/user";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWTSecretKey } from "..";
import { sndResponse } from "../utils/response";
import { Log } from "../model/tx_logs";

export async function registerUser(req: Request, res: Response) {
    try {
        const body = req.body;
        const { success, error, data } = signUpSchema.safeParse(body);
        if (!success) {
            return res.status(400).json({
                message: "invalid input",
                error: error.issues[0].message,
            });
        }

        const { username, password, role } = data;
        const userExists = await User.findOne({ username: username });
        if (userExists) {
            return sndResponse(
                res,
                400,
                "user with this username already exists",
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            username: username,
            password: hashedPassword,
            role: role,
        });

        return res.status(201).json({
            message: "user created successfully",
            id: newUser._id,
            role: role,
        });
    } catch (error) {
        console.log("error while registering a user : ", error);
        return sndResponse(res, 500, "failed to create user");
    }
}

export async function loginUser(req: Request, res: Response) {
    try {
        const body = req.body;
        const { success, error, data } = signInSchema.safeParse(body);
        if (!success) {
            return res.status(401).json({
                message: "invalid credentials",
                error: error.issues[0].message,
            });
        }

        const { username, password } = data;
        const userExists = await User.findOne({ username: username });
        if (!userExists) {
            return sndResponse(res, 401, "invalid credentials");
        }

        const validPassword = await bcrypt.compare(
            password,
            userExists.password,
        );
        if (!validPassword) {
            return sndResponse(res, 401, "invalid credentials");
        }

        const token = jwt.sign(
            { userId: userExists._id.toString(), role: userExists.role },
            JWTSecretKey,
            { expiresIn: "1d" },
        );
        res.status(200).json({
            message: "user logged in successfully",
            token: token,
        });
    } catch (error) {
        console.log("error while logging in : ", error);
        return sndResponse(res, 500, "failed to login");
    }
}

export async function onRamp(req: Request, res: Response) {
    try {
        const body = req.body;
        const { success, error, data } = onRampSchema.safeParse(body);
        if (!success) {
            return res.status(400).json({
                message: "invalid input",
                error: error.issues[0].message,
            });
        }

        const { amount } = data;
        const user = await User.findByIdAndUpdate(
            { _id: req.userId },
            { $inc: { availableUSD: amount } },
            { returnDocument: "after" },
        );

        if (!user) {
            return sndResponse(res, 404, "user not found");
        }
        // done with the update

        // also need to create new record for every amount change in the wallet table
        await Log.create({
            userId: req.userId,
            action: "onramp",
            qtyChange: amount,
        });
        return res.status(200).json({
            message: "balance added successfully",
            balance: user.availableUSD,
        });
    } catch (error) {
        console.log("error which onramp: ", error);
        return sndResponse(res, 500, "failed to update the balance");
    }
}

export async function getProfile(req: Request, res: Response) {
    try {
        const userId = req.userId;
        if (!userId) {
            return sndResponse(res, 404, "user not found");
        }

        // here we exclude the password field
        const user = await User.findOne({ _id: userId }).select("-password");
        if (!user) {
            return sndResponse(res, 404, "user not found");
        }

        return res.status(200).json({
            message: "user found",
            user: user,
        });
    } catch (error) {
        console.log("error fetching profile", error);
        return sndResponse(res, 500, "failed to get user's profile");
    }
}

export async function getWalletHistory(req: Request, res: Response) {
    try {
        const userId = req.userId;
        if (!userId) {
            return sndResponse(res, 404, "user not found");
        }

        const transactions = await Log.find({ userId: userId });
        return res.status(200).json({
            transactions: transactions,
        });
    } catch (error) {
        console.log("failed to fetch wallet history", error);
        return sndResponse(res, 500, "failed to extract wallet history");
    }
}
