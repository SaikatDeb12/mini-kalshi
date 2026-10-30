import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWTSecretKey } from "..";
import { sndResponse } from "../utils/response";

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

        if (
            typeof validToken === "string" ||
            typeof validToken.userId !== "string" ||
            !["user", "admin"].includes(validToken.role)
        ) {
            return sndResponse(response, 401, "invalid token payload");
        }

        request.userId = validToken.userId;
        request.role = validToken.role;
        next();
    } catch (error) {
        return sndResponse(response, 401, "invalid token");
    }
}
