import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { marketController } from "../controller/market";

const { createMarket, getAllMarket } = marketController;

export const marketRouter = Router();
marketRouter.post("/market", authMiddleware, createMarket);
marketRouter.get("/markets", authMiddleware, getAllMarket);
