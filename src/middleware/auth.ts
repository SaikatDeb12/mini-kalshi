import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWTSecretKey } from "..";

export async function authMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
) {
    try {
        const token = request.headers.authorization?.split(" ")[1];
        if (!token) {
            return response.status(401).json({
                message: "token not found",
            });
        }
        const validToken = jwt.verify(token, JWTSecretKey);
        if (!validToken) {
            return response.status(401).json({
                message: "invalid token",
            });
        }

        if (typeof validToken == "string" || !validToken.userId) {
            return response.status(401).json({
                message: "invalid credentials",
            });
        }

        request.userId = validToken.userId;
        next();
    } catch (error) {
        return response.status(401).json({
            message: "invalid token",
        });
    }
}
