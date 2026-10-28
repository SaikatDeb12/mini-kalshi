import * as z from "zod";

export const createMarketSchema = z.object({
    title: z.string().min(3),
    initialWager: z.number().int().positive(),
    side: z.enum(["yes", "no"]),
    // validate the date
    expiry: z.coerce.date(),
});

export const placeBetSchema = z.object({
    marketId: z.string(),
    amount: z.number().int().positive(),
});
