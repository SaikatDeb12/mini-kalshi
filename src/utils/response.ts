import type { Response } from "express";

export function sendResponse(res: Response, status: number, msg: string) {
    res.status(status).json({ message: msg });
}
