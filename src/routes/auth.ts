import { Router } from "express";
import { loginUser, registerUser } from "../controller/auth";

export const authRouter = Router();
authRouter.post("/signup", registerUser);
authRouter.post("/signin", loginUser);
