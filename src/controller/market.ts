import type { Request, Response } from "express";
import { createMarketSchema, createOrderSchema } from "../types/market";
import { Market } from "../model/market";
import { sendResponse } from "../utils/response";
import { User } from "../model/user";
import { Orderbook } from "../model/orderbook";
import mongoose from "mongoose";

export async function createMarket(req: Request, res: Response) {
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
                    { session },
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
}

export async function getAllMarket(req: Request, res: Response) {
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
}
