import type { Request, Response } from "express";
import { onRampSchema, signInSchema, signUpSchema } from "../types/auth";
import { User } from "../model/user";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWTSecretKey } from "..";
import { sendResponse } from "../utils/response";
import { Log } from "../model/tx_logs";

export const authController = {
    registerUser: async (req: Request, res: Response) => {
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
                return sendResponse(
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
            return sendResponse(res, 500, "failed to create user");
        }
    },

    loginUser: async (req: Request, res: Response) => {
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
                return sendResponse(res, 401, "invalid credentials");
            }

            const validPassword = await bcrypt.compare(
                password,
                userExists.password,
            );
            if (!validPassword) {
                return sendResponse(res, 401, "invalid credentials");
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
            return sendResponse(res, 500, "failed to login");
        }
    },

    onRamp: async (req: Request, res: Response) => {
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
            if (!Number.isSafeInteger(amount) || amount < 0) {
                return sendResponse(res, 400, "amount cannot be in negative");
            }

            const user = await User.findByIdAndUpdate(
                { _id: req.userId },
                { $inc: { availableUSD: amount } },
                { returnDocument: "after" },
            );

            if (!user) {
                return sendResponse(res, 404, "user not found");
            }
            // done with the update

            // also need to create new record in logs table
            await Log.create({
                userId: req.userId,
                action: "onramp",
                qtyChange: 0,
                balanceUSDChange: amount,
            });

            return res.status(200).json({
                message: "balance added successfully",
                balance: user.availableUSD,
            });
        } catch (error) {
            console.log("error which onramp: ", error);
            return sendResponse(res, 500, "failed to update the balance");
        }
    },

    getProfile: async (req: Request, res: Response) => {
        try {
            const userId = req.userId;
            if (!userId) {
                return sendResponse(res, 404, "user not found");
            }

            // here we exclude the password field
            const user = await User.findOne({ _id: userId }).select(
                "-password",
            );
            if (!user) {
                return sendResponse(res, 404, "user not found");
            }

            return res.status(200).json({
                message: "user found",
                user: user,
            });
        } catch (error) {
            console.log("error fetching profile", error);
            return sendResponse(res, 500, "failed to get user's profile");
        }
    },

    getTransactionHistory: async (req: Request, res: Response) => {
        try {
            const userId = req.userId;
            if (!userId) {
                return sendResponse(res, 404, "userId not found");
            }

            const userExists = await User.findById(userId);
            if (!userExists) {
                return sendResponse(res, 404, "user not found");
            }

            const page = Number(req.query.page) ?? 1;
            const limit = Number(req.query.limit) ?? 10;

            if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit)) {
                return sendResponse(res, 400, "invalid pagination");
            }

            const transactions = await Log.find({ userId: userId })
                .sort({ _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit);
            return res.status(200).json({
                page: page,
                limit: limit,
                transactions: transactions,
            });
        } catch (error) {
            console.log("failed to fetch wallet history", error);
            return sendResponse(res, 500, "failed to extract wallet history");
        }
    },
};
