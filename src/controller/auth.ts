import type { Request, Response } from "express";
import { signInSchema, signUpSchema } from "../types/auth";
import { User } from "../model/user";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWTSecretKey } from "..";

export async function registerUser(request: Request, response: Response) {
    try {
        const body = request.body;
        const { success, error, data } = signUpSchema.safeParse(body);
        if (!success) {
            return response.status(400).json({
                message: "invalid credentials",
                error: error.issues[0].message,
            });
        }

        const { username, password } = data;
        const userExists = await User.findOne({ username: username });
        if (userExists) {
            return response.status(400).json({
                message: "user with this username already exists",
            });
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
        return response.status(500).json({
            message: "failed to create user",
        });
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
            return response.status(401).json({
                message: "invalid credentials",
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            userExists.password,
        );
        if (!validPassword) {
            return response.status(401).json({
                message: "invalid credentials",
            });
        }

        const secretKey = JWTSecretKey;
        const token = jwt.sign({ userId: userExists._id }, secretKey);
        response.status(200).json({
            message: "user logged in successfully",
            token: token,
        });
    } catch (error) {
        console.log("error while logging in : ", error);
        response.status(500).json({
            message: "failed to log in",
        });
    }
}
