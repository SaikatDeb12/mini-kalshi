import * as z from "zod";

export const createMarketSchema = z.object({
    title: z.string().min(3).max(25),
    // converting the date from string -> timestamp
    expiry: z.coerce.date(),
});

export const createOrderSchema = z.object({
    side: z.enum(["yes", "no"]),
    type: z.enum(["buy", "sell"]),
    price: z.number().int().min(1).max(99),
    quantity: z.number().int().min(0),
});
