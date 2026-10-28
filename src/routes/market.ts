import { Router } from "express";
import { createMarket } from "../controller/market";
import { authMiddleware } from "../middleware/auth";

export const marketRouter = Router();
marketRouter.post("/market", authMiddleware, createMarket);
