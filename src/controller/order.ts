import type { Request, Response } from "express";
import { Market } from "../model/market";
import { User } from "../model/user";
import { Orderbook } from "../model/orderbook";
import mongoose from "mongoose";
import { sendResponse } from "../utils/response";
import { Order } from "../model/order";
import { Log } from "../model/tx_logs";
import { Stock } from "../model/stock_balance";
import { createOrderSchema } from "../types/market";

export async function placeOrder(req: Request, res: Response) {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return sendResponse(res, 404, "user not found");
        }

        const { marketString } = req.params;
        const marketId = Array.isArray(marketString)
            ? marketString[0]
            : marketString;

        const market = await Market.findById(marketId);
        if (!market) {
            return sendResponse(res, 404, "market not found");
        }

        if (market.resolution == "yes") {
            return sendResponse(res, 400, "market already resolved");
        }

        if (market.expiry <= new Date()) {
            return sendResponse(res, 400, "market already expired");
        }

        if (market.creatorId.toString() == req.userId) {
            return sendResponse(
                res,
                400,
                "creator cannot bet against there own market",
            );
        }

        const body = req.body;
        const { success, error, data } = createOrderSchema.safeParse(body);
        if (!success) {
            return res.status(400).json({
                message: "invalid input",
                error: error.issues[0].message,
            });
        }

        const { side, type, price, quantity } = data;
        const totalAmount = price * quantity;

        const result = await mongoose.connection.transaction(
            async (session) => {
                const orderbook = await Orderbook.findOne({
                    marketId: market._id,
                }).session(session);

                if (!orderbook) {
                    return sendResponse(res, 404, "orderbook not found");
                }

                if (type == "buy") {
                    await User.findOneAndUpdate(
                        { _id: user._id },
                        {
                            $inc: {
                                availableUSD: -totalAmount,
                                lockedUSD: totalAmount,
                            },
                        },
                        { returnDocument: "after", session: session },
                    );
                } else {
                    await Stock.findOneAndUpdate(
                        {
                            userId: user._id,
                            marketId: market._id,
                            outcome: side,
                            $expr: {
                                $gte: [
                                    { $subtract: ["$qty", "$lockedQty"] },
                                    quantity,
                                ],
                            },
                        },
                        { $inc: { lockedQty: quantity } },
                        { returnDocument: "after", session: session },
                    );
                }

                const [newOrder] = await Order.create(
                    [
                        {
                            userId: user._id,
                            orderbookId: orderbook._id,
                            type: type,
                            price: price,
                            quantity: quantity,
                            remainingQuantity: quantity,
                            status: "open",
                        },
                    ],
                    { session },
                );

                await Log.create({
                    userId: req.userId,
                    marketId: market._id,
                    orderId: newOrder._id,
                    outcome: side,
                    action: "lock",
                    qtyChange: 0,
                    lockedQtyChange: type == "sell" ? quantity : 0,
                    lockedUSDChange: type == "buy" ? totalAmount : 0,
                    balanceUSDChange: type == "buy" ? totalAmount * -1 : 0,
                });
            },
        );
        return res.status(200).json({
            message: "order placed successfully",
            result: result,
        });
    } catch (error) {
        console.log("error while placing order : ", error);
        return sendResponse(res, 500, "failed to place order");
    }
}
