import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { marketController } from "../controller/market";
import { roleMiddleware } from "../middleware/role";

const { createMarket, getAllMarket, splitMarket, mergeMarket, resolveMarket } =
    marketController;

export const marketRouter = Router();
marketRouter.post("/market", authMiddleware, createMarket);
marketRouter.get("/markets", authMiddleware, getAllMarket);

marketRouter.post("/market/:marketIdParam/split", authMiddleware, splitMarket);
marketRouter.post("/market/:marketIdParam/merge", authMiddleware, mergeMarket);
marketRouter.post(
    "/market/:marketIdParam/resolve",
    authMiddleware,
    roleMiddleware,
    resolveMarket,
);
