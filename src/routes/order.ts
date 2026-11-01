import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { placeOrder } from "../controller/order";

export const orderRouter = Router();
orderRouter.post("/order", authMiddleware, placeOrder);
