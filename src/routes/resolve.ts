import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { resolveMarket } from "../controller/resolve";
import { roleMiddleware } from "../middleware/role";

export const resolveRouter = Router();
resolveRouter.post("/resolve", authMiddleware, roleMiddleware, resolveMarket);
