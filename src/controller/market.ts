import type { Request, Response } from "express";
import { createMarketSchema, placeBetSchema } from "../types/market";
import { Market } from "../model/market";
import { sndResponse } from "../utils/response";
import { User } from "../model/user";
import { Wallet } from "../model/walletEvent";
import { Bet } from "../model/bet";

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

        const { title, initialWager, side, expiry } = data;
        // 1) check the expiry
        if (expiry <= new Date()) {
            return sndResponse(
                res,
                400,
                "expiry data can only be in the future",
            );
        }

        // 2) find user and check if they have enough balance or not
        const user = await User.findById(req.userId);
        if (!user) {
            return sndResponse(res, 404, "user not found");
        }

        if (user.balance < initialWager) {
            return sndResponse(res, 400, "insufficient balance");
        }
        user.balance -= initialWager;
        await user.save();

        // 3) create market
        const newMarket = await Market.create({
            title: title,
            initialWager: initialWager,
            side: side,
            creatorId: req.userId,
            expiry: expiry,
        });

        // 4) update wallet tx_type and amount
        await Wallet.create({
            userId: req.userId,
            tx_type: "created",
            externalId: { marketId: newMarket._id },
            amount: initialWager * -1,
        });

        //done
        return res.status(201).json({
            message: "market created successfully",
            marketId: newMarket._id,
        });
    } catch (error) {
        console.log("error creating market: ", error);
        return sndResponse(res, 500, "failed to create market");
    }
}

export async function getAllMarket(req: Request, res: Response) {
    try {
        const userId = req.userId;
        if (!userId) {
            return sndResponse(res, 404, "user not found");
        }

        const marketList = await Market.find({ creatorId: userId }).populate(
            "creatorId",
            "username",
        );
        return res.status(200).json({
            message: "fetched all the markets",
            markets: marketList,
        });
    } catch (err) {
        console.log("error fetching all the market", err);
        return sndResponse(res, 500, "failed to fetch all markets");
    }
}

export async function placeBet(req: Request, res: Response) {
    try {
        const body = req.body;
        const { success, error, data } = placeBetSchema.safeParse(body);
        if (!success) {
            return res.status(400).json({
                message: "invalid input",
                error: error.issues[0].message,
            });
        }

        const { marketId, amount } = data;
        const market = await Market.findOne({ _id: marketId });
        if (!market) {
            return sndResponse(res, 404, "no market found");
        }

        if (market.resolution == "yes") {
            return sndResponse(res, 400, "market already resolved");
        }

        if (market.expiry <= new Date()) {
            return sndResponse(res, 400, "market already expired");
        }

        if (market.creatorId.toString() == req.userId) {
            return sndResponse(
                res,
                400,
                "creator cannot bet against there own market",
            );
        }

        const existingBets = await Bet.find({
            marketId: marketId,
        });

        const totalBets = existingBets.reduce(
            (sum, bet) => sum + bet.betAmount,
            0,
        );

        if (totalBets + amount > market.initialWager) {
            return sndResponse(
                res,
                400,
                "bet exceeds remaining available amount",
            );
        }

        const user = await User.findOne({ _id: req.userId });
        if (!user) {
            return sndResponse(res, 404, "user not found");
        }

        if (user.balance < amount) {
            return sndResponse(res, 400, "insufficient balance");
        }

        user.balance -= amount;
        await user.save();

        const marketSide = market.side;
        const userSide = marketSide === "yes" ? "no" : "yes";
        const newBet = await Bet.create({
            userId: req.userId,
            marketId: marketId,
            betAmount: amount,
            side: userSide,
        });

        await Wallet.create({
            userId: req.userId,
            tx_type: "bet",
            externalId: {
                betId: newBet._id,
                marketId: marketId,
            },
            amount: amount * -1,
        });
        return sndResponse(res, 200, "bet placed successfully");
    } catch (error) {
        console.log("error while placing bet : ", error);
        return sndResponse(res, 500, "failed to place bet");
    }
}
