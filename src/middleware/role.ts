import { type Request, type Response, type NextFunction } from "express";
import { sendResponse } from "../utils/response";

export async function roleMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const role = req.role;
    if (role != "admin") {
        return sendResponse(res, 403, "admin access required");
    }
    next();
}
