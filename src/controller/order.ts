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
import { Fill } from "../model/fills";

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
                        throw new Error("market not found");
                    }

                    if (market.resolution == "yes") {
                        throw new Error("market already resolved");
                    }

                    if (market.expiry <= new Date()) {
                        throw new Error("market already expired");
                    }

                    if (market.creatorId.toString() == req.userId) {
                        throw new Error(
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
                        throw new Error("market closed");
                    }

                    const user = await User.findById(req.userId).session(
                        session,
                    );
                    if (!user) {
                        throw new Error("user not found");
                    }
                    const userId = user._id;

                    const orderbook = await Orderbook.findOne({
                        marketId: market._id,
                    });
                    if (!orderbook) {
                        throw new Error("orderbook not found");
                    }

                    const sameSideOrderbook = await Orderbook.findOne({
                        marketId: market._id,
                        outcome: side,
                    });

                    const oppositeSideOrderbook = await Orderbook.findOne({
                        marketId: market._id,
                        outcome: side == "yes" ? "no" : "yes",
                    });

                    if (!sameSideOrderbook || !oppositeSideOrderbook) {
                        throw new Error("orderbook not found");
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
                        if (!locked) {
                            throw new Error("insufficient balance");
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
                            throw new Error("insufficient stocks");
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

                    // matching similar order/candidate and storing it in the eligibleOrders
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

                        for (const ask of asks) {
                            eligibleOrders.push({
                                maker: ask,
                                kind: "transfer",
                                effectivePrice: ask.price,
                            });
                        }

                        // for mint, when we want to 'buy' yes, but no one to 'sell' yes
                        // so matching is done b/w buy 'yes' and buy 'no'
                        const oppositeBids = await Order.find({
                            userId: { $ne: userId },
                            orderbookId: oppositeSideOrderbook._id,
                            type: "buy",
                            price: { $gte: 100 - price },
                            remainingQuantity: { $gt: 0 },
                            status: { $in: ["open", "partial"] },
                        }).session(session);

                        for (const bid of oppositeBids) {
                            eligibleOrders.push({
                                maker: bid,
                                kind: "mint",
                                effectivePrice: 100 - bid.price,
                            });
                        }

                        // order in which we try to sort(custom comparator)
                        // 1) lowerst price
                        // 2) oldest order first
                        // 3) compare ids
                        eligibleOrders.sort(
                            (a, b) =>
                                a.effectivePrice - b.effectivePrice ||
                                new Date(a.maker.createdAt).getTime() -
                                    new Date(b.maker.createdAt).getTime() ||
                                String(a.maker._id).localeCompare(
                                    String(b.maker._id),
                                ),
                        );
                    } else {
                        // sell yes matches buy yes
                        const bids = await Order.find({
                            orderbookId: sameSideOrderbook._id,
                            type: "buy",
                            price: { $gte: price },
                            remainingQuantity: { $gt: 0 },
                            status: { $in: ["open", "partial"] },
                            userId: { $ne: userId },
                        })
                            .sort({ price: -1, createdAt: 1, _id: 1 })
                            .session(session);

                        for (const bid of bids) {
                            eligibleOrders.push({
                                maker: bid,
                                kind: "transfer",
                                effectivePrice: bid.price,
                            });
                        }
                    }

                    // here we try to find potential matches, then execute/swap the orders
                    // existing order(Maker) -> somebody who already want to buy/sell
                    // incoming order(Taker) -> somebody with opposite
                    for (const order of eligibleOrders) {
                        if (newOrder.remainingQuantity == 0) break;
                        const maker = order.maker;
                        const matchedQty = Math.min(
                            newOrder.remainingQuantity,
                            maker.remainingQuantity,
                        );
                        if (matchedQty < 0) {
                            continue;
                        }

                        const executionPrice = order.effectivePrice;
                        const [fill] = await Fill.create(
                            [
                                {
                                    makerOrderId: maker._id,
                                    takerOrderId: newOrder._id,
                                    matchType: order.kind,
                                    makerPrice: maker.price,
                                    takerPrice:
                                        order.kind == "mint"
                                            ? executionPrice
                                            : maker.price,
                                    qty: matchedQty,
                                },
                            ],
                            { session },
                        );

                        if (order.kind == "mint") {
                            // MINT : Here both users are buyers(Takers) with opposite side/outcome
                            // both side either buy 'yes' or buy 'no'
                            // Eg : User A -> buy NO at 45
                            //      User B -> buy YES at 60
                            //      Qty -> 10
                            //      limit price : 105
                            //      then, complete 10 YES,NO at 100 cents each
                            const incomingLockedAmt =
                                newOrder.price * matchedQty;
                            const buyerExecutionPrice = 100 - maker.price;
                            const actualCost = buyerExecutionPrice * matchedQty;
                            const incomingRefund =
                                incomingLockedAmt - actualCost;
                            const existingLockedAmt = maker.price * matchedQty;

                            // buyers : wants to buy 'yes' or 'no'
                            const buyerUpdateResult = await User.updateOne(
                                {
                                    _id: newOrder.userId,
                                    lockedUSD: { $gte: incomingLockedAmt },
                                },
                                {
                                    $inc: {
                                        lockedUSD: -incomingLockedAmt,
                                        availableUSD: incomingRefund,
                                    },
                                },
                                { session },
                            );

                            const makerResult = await User.updateOne(
                                {
                                    _id: maker.userId,
                                    lockedUSD: { $gte: existingLockedAmt },
                                },
                                {
                                    $inc: { lockedUSD: -existingLockedAmt },
                                },
                                { session },
                            );

                            if (
                                buyerUpdateResult.matchedCount != 1 ||
                                makerResult.matchedCount != 1
                            ) {
                                throw new Error("inconsistent balance");
                            }

                            //here distributing the new stock of 'yes' and 'no'
                            await Stock.updateOne(
                                {
                                    userId: newOrder.userId,
                                    marketId,
                                    outcome: side,
                                },
                                {
                                    $inc: { qty: matchedQty },
                                    $setOnInsert: { lockedQty: 0 },
                                },
                                { upsert: true, session },
                            );
                            await Stock.updateOne(
                                {
                                    userId: maker.userId,
                                    marketId,
                                    outcome: side == "yes" ? "no" : "yes",
                                },
                                {
                                    $inc: { qty: matchedQty },
                                    $setOnInsert: { lockedQty: 0 },
                                },
                                { upsert: true, session },
                            );

                            await Market.updateOne(
                                { _id: marketId },
                                { $inc: { totalIssued: matchedQty } },
                                { session },
                            );

                            await Log.create(
                                [
                                    {
                                        userId: newOrder.userId,
                                        marketId,
                                        orderId: newOrder._id,
                                        fillId: fill._id,
                                        outcome: side,
                                        action: "buy",
                                        qtyChange: matchedQty,
                                        lockedQtyChange: 0,
                                        balanceUSDChange: incomingRefund,
                                        lockedUSDChange: -incomingLockedAmt,
                                    },
                                    {
                                        userId: maker.userId,
                                        marketId,
                                        orderId: maker._id,
                                        fillId: fill._id,
                                        outcome: side == "yes" ? "no" : "yes",
                                        action: "buy",
                                        qtyChange: matchedQty,
                                        lockedQtyChange: 0,
                                        balanceUSDChange: 0,
                                        lockedUSDChange: -existingLockedAmt,
                                    },
                                ],
                                { session },
                            );
                        } else {
                            // TRANSFER: one buyer and one seller trade existing contracts
                            // Maker does not always mean 'seller', and taker does not always mean 'buyer'
                            const buyer = type === "buy" ? newOrder : maker;
                            const seller = type === "sell" ? newOrder : maker;
                            const reserved = buyer.price * matchedQty;
                            const cost = maker.price * matchedQty; // resting maker sets price
                            const refund = reserved - cost;
                            if (refund < 0) throw new Error("INVALID_PRICE");

                            const buyerPaid = await User.updateOne(
                                {
                                    _id: buyer.userId,
                                    lockedUSD: { $gte: reserved },
                                },
                                {
                                    $inc: {
                                        lockedUSD: -reserved,
                                        availableUSD: refund,
                                    },
                                },
                                { session },
                            );
                            const sellerPaid = await User.updateOne(
                                { _id: seller.userId },
                                { $inc: { availableUSD: cost } },
                                { session },
                            );
                            if (
                                buyerPaid.matchedCount !== 1 ||
                                sellerPaid.matchedCount !== 1
                            ) {
                                throw new Error("inconsistent balance");
                            }

                            const sellerStock = await Stock.updateOne(
                                {
                                    userId: seller.userId,
                                    marketId,
                                    outcome: side,
                                    lockedQty: { $gte: matchedQty },
                                    qty: { $gte: matchedQty },
                                },
                                {
                                    $inc: {
                                        qty: -matchedQty,
                                        lockedQty: -matchedQty,
                                    },
                                },
                                { session },
                            );
                            if (sellerStock.matchedCount !== 1) {
                                throw new Error("inconsistent stock");
                            }

                            await Stock.updateOne(
                                {
                                    userId: buyer.userId,
                                    marketId,
                                    outcome: side,
                                },
                                {
                                    $inc: { qty: matchedQty },
                                    $setOnInsert: { lockedQty: 0 },
                                },
                                { upsert: true, session },
                            );

                            await Log.create(
                                [
                                    {
                                        userId: buyer.userId,
                                        marketId,
                                        orderId: buyer._id,
                                        fillId: fill._id,
                                        outcome: side,
                                        action: "buy",
                                        qtyChange: matchedQty,
                                        lockedQtyChange: 0,
                                        balanceUSDChange: refund,
                                        lockedUSDChange: -reserved,
                                    },
                                    {
                                        userId: seller.userId,
                                        marketId,
                                        orderId: seller._id,
                                        fillId: fill._id,
                                        outcome: side,
                                        action: "sell",
                                        qtyChange: -matchedQty,
                                        lockedQtyChange: -matchedQty,
                                        balanceUSDChange: cost,
                                        lockedUSDChange: 0,
                                    },
                                ],
                                { session },
                            );
                        }
                        maker.remainingQuantity -= matchedQty;
                        maker.status =
                            maker.remainingQuantity === 0
                                ? "filled"
                                : "partial";
                        await maker.save({ session });

                        newOrder.remainingQuantity -= matchedQty;
                    }
                    newOrder.status =
                        newOrder.remainingQuantity === 0
                            ? "filled"
                            : newOrder.remainingQuantity === quantity
                              ? "open"
                              : "partial";
                    await newOrder.save({ session });

                    return {
                        orderId: newOrder._id,
                        marketId,
                        type,
                        side,
                        price,
                        requestedQty: quantity,
                        filledQty: quantity - newOrder.remainingQuantity,
                        remainingQty: newOrder.remainingQuantity,
                        status: newOrder.status,
                    };
                },
            );
            return res.status(200).json({
                message: "order placed successfully",
                result: result,
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === "market not found") {
                    return sendResponse(res, 404, "market not found");
                }

                if (error.message === "market already resolved") {
                    return sendResponse(res, 404, "market already resolved");
                }

                if (error.message === "market already expired") {
                    return sendResponse(res, 404, "market already expired");
                }

                if (
                    error.message ===
                    "creator cannot bet against there own market"
                ) {
                    return sendResponse(
                        res,
                        404,
                        "creator cannot bet against there own market",
                    );
                }

                if (error.message === "market closed") {
                    return sendResponse(res, 403, "market closed");
                }

                if (error.message === "user not found") {
                    return sendResponse(res, 404, "user not found");
                }

                if (error.message === "orderbook not found") {
                    return sendResponse(res, 404, "orderbook not found");
                }

                if (error.message === "orderbook not found") {
                    return sendResponse(res, 404, "orderbook not found");
                }

                if (error.message === "inconsistent balance") {
                    return sendResponse(res, 400, "inconsistent balance");
                }

                if (error.message === "insufficient balance") {
                    return sendResponse(res, 400, "insufficient balance");
                }

                if (error.message === "inconsistent stocks") {
                    return sendResponse(res, 400, "inconsistent stock");
                }

                if (error.message === "insufficient stocks") {
                    return sendResponse(res, 400, "insufficient stock");
                }
            }
            console.log("error while placing order : ", error);
            return sendResponse(res, 500, "failed to place order");
        }
    },
};
