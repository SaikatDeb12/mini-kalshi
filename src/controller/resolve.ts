import type { Request, Response } from "express";
import { resolveMarketSchema } from "../types/resolve";
import { Bet } from "../model/bet";
import { User } from "../model/user";
import { Wallet } from "../model/walletEvent";
import { Market } from "../model/market";
import { sndResponse } from "../utils/response";

export async function resolveMarket(req: Request, res: Response) {
    try {
        const parsed = resolveMarketSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Incorrect Format" });
        }
        const { marketId, resolution } = parsed.data;

        const market = await Market.findById({ _id: marketId });

        if (!market) {
            return res.status(404).json({
                error: "market not found",
            });
        }

        if (market.resolution !== null) {
            return res.status(400).json({
                error: "market already resolved",
            });
        }
        if (new Date() < market.expiry) {
            return res.status(400).json({
                error: "market has not expired yet",
            });
        }

        const bets = await Bet.find({ marketId });
        const totalBets = bets.reduce((sum, bet) => sum + bet.betAmount, 0);

        if (market.side === resolution) {
            // creator wins
            const payout = totalBets * 2 + (market.initialWager - totalBets);
            await User.updateOne(
                { _id: market.creatorId },
                { $inc: { balance: payout } },
            );

            await Wallet.create({
                userId: market.creatorId,
                tx_type: "payout",
                externalId: { marketId },
                amount: payout,
            });
        } else {
            // the one who bet wins
            for (const bet of bets) {
                const payout = bet.betAmount * 2;

                await User.updateOne(
                    { _id: bet.userId },
                    { $inc: { balance: payout } },
                );

                await Wallet.create({
                    userId: bet.userId,
                    tx_type: "payout",
                    externalId: {
                        marketId: marketId,
                        betId: bet._id,
                    },
                    amount: payout,
                });
            }

            // no one bet on the market
            const refund = market.initialWager - totalBets;
            if (refund > 0) {
                await User.updateOne(
                    { _id: market.creatorId },
                    { $inc: { balance: refund } },
                );

                await Wallet.create({
                    userId: market.creatorId,
                    tx_type: "refund",
                    externalId: { marketId },
                    amount: refund,
                });
            }
        }

        market.resolution = resolution;
        await market.save();

        return res.json({
            message: "market resolved successfully",
            resolution: resolution,
        });
    } catch (error) {
        console.log("error resolving the market : ", error);
        return sndResponse(res, 500, "failed to resolve the market");
    }
}
