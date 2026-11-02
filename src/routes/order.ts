import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { orderController } from "../controller/order";

const { placeOrder } = orderController;

export const orderRouter = Router();
orderRouter.post("/order", authMiddleware, placeOrder);
