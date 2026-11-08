import type { Request, Response } from "express";
import {
    createMarketSchema,
    createSplitSchema,
    mergeMarketSchema,
    resolveMarketSchema,
} from "../types/market";
import { Market } from "../model/market";
import { sendResponse } from "../utils/response";
import { User } from "../model/user";
import { Orderbook } from "../model/orderbook";
import mongoose from "mongoose";
import { Stock } from "../model/stock_balance";
import { Log } from "../model/tx_logs";
import { Order } from "../model/order";

export const marketController = {
    createMarket: async (req: Request, res: Response) => {
        try {
            const body = req.body;
            const { success, error, data } = createMarketSchema.safeParse(body);
            if (!success) {
                return res.status(400).json({
                    message: "invalid input",
                    error: error.issues[0].message,
                });
            }

            const { title, expiry } = data;
            // 1) check the expiry
            if (expiry <= new Date()) {
                return sendResponse(
                    res,
                    400,
                    "expiry data can only be in the future",
                );
            }

            // 2) find user and check if they have enough balance or not
            const user = await User.findById(req.userId);
            if (!user) {
                return sendResponse(res, 404, "user not found");
            }

            // 2 - 3) create market & orderBook
            const newMarket = await mongoose.connection.transaction(
                async (session) => {
                    const markets = await Market.create(
                        [
                            {
                                title,
                                creatorId: user._id,
                                totalIssued: 0,
                                expiry,
                                resolution: null,
                            },
                        ],
                        { session },
                    );

                    const market = markets[0];
                    await Orderbook.create(
                        [
                            { outcome: "yes", marketId: market._id },
                            { outcome: "no", marketId: market._id },
                        ],
                        { ordered: true, session },
                    );

                    return market._id;
                },
            );

            // const newYesOrderbook = await Orderbook.create({
            //     outcome: "yes",
            //     marketId: newMarket._id,
            // });
            //
            // const newNoOrderbook = await Orderbook.create({
            //     outcome: "no",
            //     marketId: newMarket._id,
            // });

            return res.status(201).json({
                message: "market created successfully",
                marketId: newMarket._id,
            });
        } catch (error) {
            console.log("error creating market: ", error);
            return sendResponse(res, 500, "failed to create market");
        }
    },

    getAllMarket: async (req: Request, res: Response) => {
        try {
            const userId = req.userId;
            if (!userId) {
                return sendResponse(res, 401, "invalid token");
            }

            const user = await User.findById(req.userId);
            if (!user) {
                return sendResponse(res, 404, "user not found");
            }

            const page = Number(req.query.page ?? 1);
            const limit = Number(req.query.limit ?? 10);

            const marketList = await Market.find({ creatorId: user._id })
                .select("-creatorId")
                .sort({ _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit);

            return res.status(200).json({
                message: "fetched all the markets",
                page: page,
                limit: limit,
                markets: marketList,
            });
        } catch (err) {
            console.log("error fetching all the market", err);
            return sendResponse(res, 500, "failed to fetch all markets");
        }
    },

    splitMarket: async (req: Request, res: Response) => {
        try {
            const userId = req.userId;
            if (!userId || !mongoose.isValidObjectId(userId)) {
                return sendResponse(res, 401, "invalid token");
            }

            const user = await User.findById(userId);
            if (!user) {
                throw new Error("user not found");
            }

            const { marketIdParam } = req.params;
            const marketId = Array.isArray(marketIdParam)
                ? marketIdParam[0]
                : marketIdParam;
            if (!marketId || !mongoose.isValidObjectId(marketId)) {
                return sendResponse(res, 400, "invalid market Id");
            }

            const { success, data, error } = createSplitSchema.safeParse(
                req.body,
            );
            if (!success) {
                return res.status(400).json({
                    message: "invalid request body",
                    error: error.issues[0].message,
                });
            }

            const { quantity } = data;
            // each yes and no costing 100 cents
            const totalAmount = quantity * 100;
            if (!Number.isSafeInteger(totalAmount)) {
                return sendResponse(res, 400, "invalid split amount");
            }

            const result = await mongoose.connection.transaction(
                async (session) => {
                    // .session for find, findOne, findOneUpdate
                    const market =
                        await Market.findById(marketId).session(session);

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

                    // {session} for create, save, insertMany
                    const marketUpdate = await Market.updateOne(
                        {
                            _id: marketId,
                            resolution: null,
                            expiry: { $gte: new Date() },
                        },
                        {
                            $inc: {
                                totalIssued: quantity,
                                matchingVersion: 1,
                            },
                        },
                        { session },
                    );
                    if (marketUpdate.matchedCount != 1) {
                        throw new Error("market closed");
                    }

                    const updatedUser = await User.findOneAndUpdate(
                        {
                            _id: userId,
                            availableUSD: { $gte: totalAmount },
                        },
                        {
                            $inc: {
                                availableUSD: -totalAmount,
                            },
                        },
                        {
                            returnDocument: "after",
                            session,
                        },
                    );

                    if (!updatedUser) {
                        throw new Error("insufficient balance");
                    }

                    // now to create and update the stocks for Yes
                    await Stock.updateOne(
                        {
                            userId: userId,
                            marketId: marketId,
                            outcome: "yes",
                        },
                        {
                            $inc: { qty: quantity },
                        },
                        { upsert: true, session },
                    );

                    await Stock.updateOne(
                        {
                            userId: userId,
                            marketId: marketId,
                            outcome: "no",
                        },
                        {
                            $inc: { qty: quantity },
                        },
                        { upsert: true, session },
                    );

                    // create log :
                    await Log.create(
                        [
                            {
                                userId: userId,
                                marketId: marketId,
                                outcome: "yes",
                                action: "split",
                                qtyChange: quantity,
                                lockedQtyChange: 0,
                                balanceUSDChange: -totalAmount,
                                lockedUSDChange: 0,
                            },
                            {
                                userId: userId,
                                marketId: marketId,
                                outcome: "no",
                                action: "split",
                                qtyChange: quantity,
                                lockedQtyChange: 0,
                                balanceUSDChange: 0,
                                lockedUSDChange: 0,
                            },
                        ],
                        { ordered: true, session },
                    );

                    return {
                        marketId: marketId,
                        pairsCreated: quantity,
                        yesReceived: quantity,
                        noReceived: quantity,
                        totalAmount,
                        availableUSD: updatedUser.availableUSD,
                    };
                },
            );

            return res.status(200).json({
                message: "market split done successfully",
                result,
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

                if (error.message === "insufficient balance") {
                    return sendResponse(res, 400, "insufficient balance");
                }

                if (error.message === "user not found") {
                    return sendResponse(res, 404, "user not found");
                }
            }
            console.log("error while splitting", error);
            return sendResponse(res, 500, "failed to split market");
        }
    },

    mergeMarket: async (req: Request, res: Response) => {
        try {
            const userId = req.userId;

            if (!userId || !mongoose.isValidObjectId(userId)) {
                return sendResponse(res, 401, "invalid token");
            }

            const param = req.params.marketIdParam;
            const marketId = Array.isArray(param) ? param[0] : param;

            if (!marketId || !mongoose.isValidObjectId(marketId)) {
                return sendResponse(res, 400, "invalid market ID");
            }

            const parsed = mergeMarketSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({
                    message: "invalid request body",
                    error: parsed.error.issues[0]?.message,
                });
            }

            const { quantity } = parsed.data;
            const totalAmount = quantity * 100;

            if (!Number.isSafeInteger(totalAmount)) {
                return sendResponse(res, 400, "invalid merge amount");
            }

            const result = await mongoose.connection.transaction(
                async (session) => {
                    const market =
                        await Market.findById(marketId).session(session);

                    if (!market) {
                        throw new Error("market not found");
                    }

                    if (market.resolution !== null) {
                        throw new Error("market already resolved");
                    }

                    // Coordinate MERGE with matching, SPLIT, and RESOLVE.
                    const gate = await Market.updateOne(
                        {
                            _id: marketId,
                            resolution: null,
                            totalIssued: { $gte: quantity },
                        },
                        {
                            $inc: {
                                totalIssued: -quantity,
                                matchingVersion: 1,
                            },
                        },
                        { session },
                    );

                    if (gate.matchedCount !== 1) {
                        throw new Error("market cannot be merged");
                    }

                    // Only unlocked contracts can be burned.
                    for (const outcome of ["yes", "no"] as const) {
                        const stock = await Stock.updateOne(
                            {
                                userId,
                                marketId,
                                outcome,
                                $expr: {
                                    $gte: [
                                        {
                                            $subtract: ["$qty", "$lockedQty"],
                                        },
                                        quantity,
                                    ],
                                },
                            },
                            {
                                $inc: { qty: -quantity },
                            },
                            { session },
                        );

                        if (stock.matchedCount !== 1) {
                            throw new Error("insufficient unlocked contracts");
                        }
                    }

                    // Return collateral to the user's wallet.
                    const updatedUser = await User.findByIdAndUpdate(
                        userId,
                        {
                            $inc: {
                                availableUSD: totalAmount,
                            },
                        },
                        {
                            returnDocument: "after",
                            session,
                        },
                    );

                    if (!updatedUser) {
                        throw new Error("user not found");
                    }

                    // Log both stock burns, but USD refund only once.
                    await Log.create(
                        [
                            {
                                userId,
                                marketId,
                                outcome: "yes",
                                action: "merge",
                                qtyChange: -quantity,
                                lockedQtyChange: 0,
                                balanceUSDChange: totalAmount,
                                lockedUSDChange: 0,
                            },
                            {
                                userId,
                                marketId,
                                outcome: "no",
                                action: "merge",
                                qtyChange: -quantity,
                                lockedQtyChange: 0,
                                balanceUSDChange: 0,
                                lockedUSDChange: 0,
                            },
                        ],
                        { session },
                    );

                    return {
                        marketId,
                        pairsMerged: quantity,
                        yesBurned: quantity,
                        noBurned: quantity,
                        amountReturned: totalAmount,
                        availableUSD: updatedUser.availableUSD,
                        totalIssued: market.totalIssued - quantity,
                    };
                },
            );

            return res.status(200).json({
                message: "market merge successful",
                result,
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message == "market not found") {
                    sendResponse(res, 404, "market not found");
                }
                if (error.message == "market already resolved") {
                    sendResponse(res, 400, "market already resolved");
                }
                if (error.message == "market cannot be merged") {
                    sendResponse(res, 400, "market cannot be merged");
                }
                if (error.message == "insufficient unlocked contracts") {
                    sendResponse(res, 400, "insufficient unlocked contracts");
                }
                if (error.message == "user not found") {
                    sendResponse(res, 404, "user not found");
                }
            }

            console.error("error while merging market:", error);
            return sendResponse(res, 500, "failed to merge market");
        }
    },

    resolveMarket: async (req: Request, res: Response) => {
        try {
            const userId = req.userId;

            if (!userId || !mongoose.isValidObjectId(userId)) {
                return sendResponse(res, 401, "invalid token");
            }

            const param = req.params.marketIdParam;
            const marketId = Array.isArray(param) ? param[0] : param;

            if (!marketId || !mongoose.isValidObjectId(marketId)) {
                return sendResponse(res, 400, "invalid market ID");
            }

            const parsed = resolveMarketSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({
                    message: "invalid request body",
                    error: parsed.error.issues[0]?.message,
                });
            }

            const { outcome } = parsed.data;

            const result = await mongoose.connection.transaction(
                async (session) => {
                    // 1. Validate admin against the database.
                    const admin = await User.findById(userId).session(session);

                    if (!admin || admin.role !== "admin") {
                        throw new Error("admin access required");
                    }

                    // 2. Validate market and ownership.
                    const market =
                        await Market.findById(marketId).session(session);

                    if (!market) {
                        throw new Error("market not found");
                    }

                    if (market.creatorId.toString() !== userId.toString()) {
                        throw new Error(
                            "only the market creator can resolve this market",
                        );
                    }

                    if (market.resolution !== null) {
                        throw new Error("market already resolved");
                    }

                    const now = new Date();

                    if (market.expiry > now) {
                        throw new Error("market has not expired yet");
                    }

                    const issuedPairs = market.totalIssued;
                    const expectedPayout = issuedPairs * 100;

                    if (
                        !Number.isSafeInteger(issuedPairs) ||
                        issuedPairs < 0 ||
                        !Number.isSafeInteger(expectedPayout)
                    ) {
                        throw new Error("invalid market issuance");
                    }

                    // 3. Close the market inside the transaction.
                    // This coordinates with placeOrder, SPLIT, and MERGE.
                    const gate = await Market.updateOne(
                        {
                            _id: marketId,
                            creatorId: admin._id,
                            resolution: null,
                            expiry: { $lte: now },
                        },
                        {
                            $set: {
                                resolution: outcome,
                                totalIssued: 0,
                            },
                            $inc: { matchingVersion: 1 },
                        },
                        { session },
                    );

                    if (gate.matchedCount !== 1) {
                        throw new Error("market cannot be resolved");
                    }

                    // 4. Fetch this market's YES and NO orderbooks.
                    const books = await Orderbook.find({
                        marketId,
                    }).session(session);

                    const yesBook = books.find(
                        (book) => book.outcome === "yes",
                    );
                    const noBook = books.find((book) => book.outcome === "no");

                    if (!yesBook || !noBook || books.length !== 2) {
                        throw new Error("inconsistent orderbooks");
                    }

                    const bookOutcomes = new Map<string, "yes" | "no">([
                        [yesBook._id.toString(), "yes"],
                        [noBook._id.toString(), "no"],
                    ]);

                    // 5. Cancel outstanding orders before settlement.
                    const openOrders = await Order.find({
                        orderbookId: {
                            $in: [yesBook._id, noBook._id],
                        },
                        status: { $in: ["open", "partial"] },
                    }).session(session);

                    for (const order of openOrders) {
                        const remaining = order.remainingQuantity;
                        const orderOutcome = bookOutcomes.get(
                            order.orderbookId.toString(),
                        );

                        if (
                            !orderOutcome ||
                            !Number.isSafeInteger(remaining) ||
                            remaining <= 0
                        ) {
                            throw new Error("inconsistent open order");
                        }

                        let balanceUSDChange = 0;
                        let lockedUSDChange = 0;
                        let lockedQtyChange = 0;

                        if (order.type === "buy") {
                            // Return unused USD reserved for this BUY.
                            const refund = order.price * remaining;

                            if (!Number.isSafeInteger(refund)) {
                                throw new Error("invalid order refund");
                            }

                            const update = await User.updateOne(
                                {
                                    _id: order.userId,
                                    lockedUSD: { $gte: refund },
                                },
                                {
                                    $inc: {
                                        availableUSD: refund,
                                        lockedUSD: -refund,
                                    },
                                },
                                { session },
                            );

                            if (update.matchedCount !== 1) {
                                throw new Error("inconsistent locked USD");
                            }

                            balanceUSDChange = refund;
                            lockedUSDChange = -refund;
                        } else if (order.type === "sell") {
                            // Unlock contracts reserved for this SELL.
                            const update = await Stock.updateOne(
                                {
                                    userId: order.userId,
                                    marketId,
                                    outcome: orderOutcome,
                                    qty: { $gte: remaining },
                                    lockedQty: { $gte: remaining },
                                },
                                {
                                    $inc: {
                                        lockedQty: -remaining,
                                    },
                                },
                                { session },
                            );

                            if (update.matchedCount !== 1) {
                                throw new Error("inconsistent locked stocks");
                            }

                            lockedQtyChange = -remaining;
                        } else {
                            throw new Error("invalid order type");
                        }

                        order.status = "cancelled";
                        // Keep remainingQuantity as the unfilled quantity.
                        await order.save({ session });

                        await Log.create(
                            [
                                {
                                    userId: order.userId,
                                    marketId,
                                    orderId: order._id,
                                    outcome: orderOutcome,
                                    action: "cancel",
                                    qtyChange: 0,
                                    lockedQtyChange,
                                    balanceUSDChange,
                                    lockedUSDChange,
                                },
                            ],
                            { session },
                        );
                    }

                    // 6. Read holders after all SELL locks are released.
                    const stocks = await Stock.find({
                        marketId,
                    }).session(session);

                    let totalYes = 0;
                    let totalNo = 0;

                    for (const stock of stocks) {
                        if (
                            !Number.isSafeInteger(stock.qty) ||
                            !Number.isSafeInteger(stock.lockedQty) ||
                            stock.qty < 0 ||
                            stock.lockedQty !== 0
                        ) {
                            throw new Error("inconsistent stock balances");
                        }

                        if (stock.outcome === "yes") {
                            totalYes += stock.qty;
                        } else if (stock.outcome === "no") {
                            totalNo += stock.qty;
                        } else {
                            throw new Error("invalid stock outcome");
                        }
                    }

                    // Every issued pair must have one YES and one NO.
                    if (totalYes !== issuedPairs || totalNo !== issuedPairs) {
                        throw new Error(
                            "stock supply does not match totalIssued",
                        );
                    }

                    // 7. Pay winners and burn all outstanding stocks.
                    let totalPaid = 0;
                    let winningContracts = 0;

                    for (const stock of stocks) {
                        if (stock.qty === 0) continue;

                        const payout =
                            stock.outcome === outcome ? stock.qty * 100 : 0;

                        if (!Number.isSafeInteger(payout)) {
                            throw new Error("invalid settlement payout");
                        }

                        if (payout > 0) {
                            const credit = await User.updateOne(
                                { _id: stock.userId },
                                {
                                    $inc: {
                                        availableUSD: payout,
                                    },
                                },
                                { session },
                            );

                            if (credit.matchedCount !== 1) {
                                throw new Error("settlement user not found");
                            }

                            winningContracts += stock.qty;
                            totalPaid += payout;
                        }

                        const burned = await Stock.updateOne(
                            {
                                _id: stock._id,
                                qty: stock.qty,
                                lockedQty: 0,
                            },
                            {
                                $set: {
                                    qty: 0,
                                },
                            },
                            { session },
                        );

                        if (burned.matchedCount !== 1) {
                            throw new Error("failed to burn contracts");
                        }

                        await Log.create(
                            [
                                {
                                    userId: stock.userId,
                                    marketId,
                                    outcome: stock.outcome,
                                    action: "settle",
                                    qtyChange: -stock.qty,
                                    lockedQtyChange: 0,
                                    balanceUSDChange: payout,
                                    lockedUSDChange: 0,
                                },
                            ],
                            { session },
                        );
                    }

                    // 8. Collateral conservation check.
                    if (
                        winningContracts !== issuedPairs ||
                        totalPaid !== expectedPayout
                    ) {
                        throw new Error("settlement collateral mismatch");
                    }

                    return {
                        marketId,
                        resolution: outcome,
                        issuedPairsSettled: issuedPairs,
                        winningContracts,
                        totalPaid,
                        cancelledOrders: openOrders.length,
                        totalIssued: 0,
                    };
                },
            );

            return res.status(200).json({
                message: "market resolved successfully",
                result,
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message == "admin access required") {
                    sendResponse(res, 403, "admin access required");
                }
                if (error.message == "market not found") {
                    sendResponse(res, 404, "market not found");
                }
                if (
                    error.message ==
                    "only the market creator can resolve this market"
                ) {
                    sendResponse(
                        res,
                        403,
                        "only the market creator can resolve this market",
                    );
                }
                if (error.message == "market already resolved") {
                    sendResponse(res, 409, "market already resolved");
                }
                if (error.message == "market has not expired yet") {
                    sendResponse(res, 400, "market has not expired yet");
                }
            }

            console.error("error while resolving market:", error);
            return sendResponse(res, 500, "failed to resolve market");
        }
    },
};

// TODO: getmarketdetails, getmarket orderbooks, get fills, cancel order, get my orders, all order details
