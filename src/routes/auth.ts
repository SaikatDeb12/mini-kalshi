import { Router } from "express";
import {
    getProfile,
    getWalletHistory,
    loginUser,
    onRamp,
    registerUser,
} from "../controller/auth";
import { authMiddleware } from "../middleware/auth";

export const authRouter = Router();
authRouter.post("/signup", registerUser);
authRouter.post("/signin", loginUser);

authRouter.post("/onramp", authMiddleware, onRamp);
authRouter.get("/profile", authMiddleware, getProfile);
authRouter.get("/transactions", authMiddleware, getWalletHistory);
