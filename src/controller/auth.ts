import type { Request, Response } from "express";
import { onRampSchema, signInSchema, signUpSchema } from "../types/auth";
import { User } from "../model/user";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWTSecretKey } from "..";
import { Wallet } from "../model/walletEvent";
import { sndResponse } from "../utils/response";

export async function registerUser(request: Request, response: Response) {
    try {
        const body = request.body;
        const { success, error, data } = signUpSchema.safeParse(body);
        if (!success) {
            return response.status(400).json({
                message: "invalid input",
                error: error.issues[0].message,
            });
        }

        const { username, password } = data;
        const userExists = await User.findOne({ username: username });
        if (userExists) {
            return sndResponse(
                response,
                400,
                "user with this username already exists",
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            username: username,
            password: hashedPassword,
            balance: 0,
        });

        return response.status(201).json({
            message: "user created successfully",
            id: newUser._id,
        });
    } catch (error) {
        console.log("error while registering a user : ", error);
        return sndResponse(response, 500, "failed to create user");
    }
}

export async function loginUser(request: Request, response: Response) {
    try {
        const body = request.body;
        const { success, error, data } = signInSchema.safeParse(body);
        if (!success) {
            return response.status(401).json({
                message: "invalid credentials",
                error: error.issues[0].message,
            });
        }

        const { username, password } = data;
        const userExists = await User.findOne({ username: username });
        if (!userExists) {
            return sndResponse(response, 401, "invalid credentials");
        }

        const validPassword = await bcrypt.compare(
            password,
            userExists.password,
        );
        if (!validPassword) {
            return sndResponse(response, 401, "invalid credentials");
        }

        const token = jwt.sign(
            { userId: userExists._id.toString() },
            JWTSecretKey,
            { expiresIn: "1d" },
        );
        response.status(200).json({
            message: "user logged in successfully",
            token: token,
        });
    } catch (error) {
        console.log("error while logging in : ", error);
        return sndResponse(response, 500, "failed to login");
    }
}

export async function onRamp(request: Request, response: Response) {
    try {
        const body = request.body;
        const { success, error, data } = onRampSchema.safeParse(body);
        if (!success) {
            return response.status(400).json({
                message: "invalid input",
                error: error.issues[0].message,
            });
        }

        const { amount } = data;
        const user = await User.findByIdAndUpdate(
            { _id: request.userId },
            { $inc: { balance: amount } },
            { returnDocument: "after" },
        );

        if (!user) {
            return sndResponse(response, 404, "user not found");
        }
        // done with the update

        // also need to create new record for every amount change in the wallet table
        await Wallet.create({
            userId: request.userId,
            tx_type: "onramp",
            amount: amount,
        });
        return response.status(200).json({
            message: "balance added successfully",
            balance: user.balance,
        });
    } catch (error) {
        console.log("error which onramp: ", error);
        return sndResponse(response, 500, "failed to update the balance");
    }
}

export async function getProfile(request: Request, response: Response) {
    try {
        const userId = request.userId;
        if (!userId) {
            return sndResponse(response, 404, "user not found");
        }

        // here we exclude the password field
        const user = await User.findOne({ _id: userId }).select("-password");
        if (!user) {
            return sndResponse(response, 404, "user not found");
        }

        return response.status(200).json({
            message: "user found",
            user: user,
        });
    } catch (error) {
        console.log("error fetching profile", error);
        return sndResponse(response, 500, "failed to get user's profile");
    }
}

export async function getWalletHistory(request: Request, response: Response) {
    try {
        const userId = request.userId;
        if (!userId) {
            return sndResponse(response, 404, "user not found");
        }

        const transactions = await Wallet.find({ userId: userId });
        return response.status(200).json({
            transactions: transactions,
        });
    } catch (error) {
        console.log("failed to fetch wallet history", error);
        return sndResponse(response, 500, "failed to extract wallet history");
    }
}
