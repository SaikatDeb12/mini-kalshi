import type { Request, Response } from "express";
import { createMarketSchema, createSplitSchema } from "../types/market";
import { Market } from "../model/market";
import { sendResponse } from "../utils/response";
import { User } from "../model/user";
import { Orderbook } from "../model/orderbook";
import mongoose from "mongoose";
import { Stock } from "../model/stock_balance";
import { Log } from "../model/tx_logs";

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
            if (!userId) {
                return sendResponse(res, 401, "invalid token");
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
                            session: session,
                        },
                    );

                    if (!updatedUser) {
                        throw new Error("insufficient balance");
                    }

                    // now to create and update the stocks for Yes
                    const yesStocks = await Stock.updateOne(
                        {
                            userId: userId,
                            marketId: marketId,
                            outcome: "yes",
                        },
                        {
                            $inc: { qty: quantity },
                        },
                        { upsert: true, session: session },
                    );

                    const noStocks = await Stock.updateOne(
                        {
                            userId: userId,
                            markeId: marketId,
                            outcome: "no",
                        },
                        {
                            $inc: { qty: quantity },
                        },
                        { upsert: true, session: session },
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
                                balanceUSDChange: -totalAmount,
                                lockedUSDChange: 0,
                            },
                        ],
                        { session },
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

                if (error.message === "insufficient balance") {
                    return sendResponse(res, 400, "insufficient balance");
                }

                if (error.message === "market closed") {
                    return sendResponse(res, 403, "market closed");
                }

                if (error.message === "user not found") {
                    return sendResponse(res, 404, "user not found");
                }
            }
            console.log("error while splitting", error);
            return sendResponse(res, 500, "failed to split market");
        }
    },
};
