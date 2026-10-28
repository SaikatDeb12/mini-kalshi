import { Router } from "express";
import {
    createMarket,
    getAllMarket,
    getBets,
    placeBet,
} from "../controller/market";
import { authMiddleware } from "../middleware/auth";

export const marketRouter = Router();
marketRouter.post("/market", authMiddleware, createMarket);
marketRouter.get("/markets", authMiddleware, getAllMarket);
marketRouter.post("/market/bet", authMiddleware, placeBet);
marketRouter.get("/market/bets", authMiddleware, getBets);
