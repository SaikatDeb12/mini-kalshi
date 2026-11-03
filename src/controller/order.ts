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

// valid market, userId
// 1) reserve balance, stocks before booking
// 2) create incoming order
// 3) find matching order
//      i) buy 'yes' matches sell 'yes' | same for 'no'
//      ii) when no sell 'yes' need to match buy 'yes' and buy 'no'
//      also,
//      i) sell 'yes' matches buy 'yes' | same for 'no'
// called : 'transfer' or 'mint'

export const orderController = {
    placeOrder: async (req: Request, res: Response) => {
        try {
            if (!req.userId) {
                return sendResponse(res, 401, "invalid token");
            }

            const { marketString } = req.params;
            const marketIdParam = Array.isArray(marketString)
                ? marketString[0]
                : marketString;

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
                    const market =
                        await Market.findById(marketIdParam).session(session);

                    if (!market) {
                        return sendResponse(res, 404, "market not found");
                    }

                    if (market.resolution == "yes") {
                        return sendResponse(
                            res,
                            400,
                            "market already resolved",
                        );
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
                    const marketId = market._id;
                    const gate = await Market.updateOne(
                        {
                            _id: marketId,
                            resolution: null,
                            expiry: { $gt: new Date() },
                        },
                        { $inc: { matchingVersion: 1 } },
                        { session },
                    );

                    if (gate.matchedCount != 1) {
                        return sendResponse(res, 403, "market closed");
                    }

                    const user = await User.findById(req.userId).session(
                        session,
                    );
                    if (!user) {
                        return sendResponse(res, 404, "user not found");
                    }
                    const userId = user._id;

                    const orderbook = await Orderbook.findOne({
                        marketId: market._id,
                    });
                    if (!orderbook) {
                        return sendResponse(res, 404, "orderbook not found");
                    }

                    const sameSideOrderbook = await Orderbook.findOne({
                        marketId: market._id,
                        outcome: side,
                    });

                    const oppositeSideOrderbook = await Orderbook.findOne({
                        marketId: market._id,
                        outcome: side == "yes" ? "yes" : "no",
                    });

                    if (!sameSideOrderbook || !oppositeSideOrderbook) {
                        return sendResponse(res, 404, "orderbook not found");
                    }

                    if (type == "buy") {
                        // here reserve for buy
                        const locked = await User.findOneAndUpdate(
                            {
                                _id: user._id,
                                availableUSD: { $gte: totalAmount },
                            },
                            {
                                $inc: {
                                    availableUSD: -totalAmount,
                                    lockedUSD: totalAmount,
                                },
                            },
                            { returnDocument: "after", session: session },
                        );
                        if (locked?.matchedCount != 1) {
                            return sendResponse(
                                res,
                                400,
                                "insufficient balance",
                            );
                        }
                    } else {
                        // here we reserve for sell
                        const locked = await Stock.findOneAndUpdate(
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
                        if (locked?.matchedCount != 1) {
                            return sendResponse(res, 400, "insufficient stock");
                        }
                    }

                    const [newOrder] = await Order.create(
                        [
                            {
                                userId: user._id,
                                orderbookId: sameSideOrderbook._id,
                                type: type,
                                price: price,
                                quantity: quantity,
                                remainingQuantity: quantity,
                                status: "open",
                            },
                        ],
                        { session },
                    );

                    // write in Log table
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

                    // matching similar order/candidate
                    const eligibleOrders: {
                        maker: typeof newOrder;
                        kind: "transfer" | "mint";
                        effectivePrice: number;
                    }[] = [];

                    if (type == "buy") {
                        // type 'buy' then i want to 'sell'
                        const asks = await Order.find({
                            userId: { $ne: userId },
                            orderbookId: sameSideOrderbook._id,
                            type: "sell",
                            price: { $lte: price },
                            remainingQuantity: { $gt: 0 },
                            status: { $in: ["open", "partial"] },
                        }).session(session);
                    }
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
    },
};
