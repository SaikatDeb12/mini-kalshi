import * as z from "zod";

export const signUpSchema = z.object({
    username: z.string().min(3).max(15),
    password: z.string().min(8).max(20),
});

export const signInSchema = z.object({
    username: z.string().min(3).max(15),
    password: z.string().min(8).max(20),
});

export const onRampSchema = z.object({
    amount: z.number().int().positive(),
});
