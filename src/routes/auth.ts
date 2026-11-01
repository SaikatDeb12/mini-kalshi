import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { authController } from "../controller/auth";

const { registerUser, loginUser, onRamp, getProfile, getTransactionHistory } =
    authController;

export const authRouter = Router();
authRouter.post("/signup", registerUser);
authRouter.post("/signin", loginUser);

authRouter.post("/onramp", authMiddleware, onRamp);
authRouter.get("/profile", authMiddleware, getProfile);
authRouter.get("/transactions", authMiddleware, getTransactionHistory);
