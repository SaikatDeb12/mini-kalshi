import "dotenv/config";
import express from "express";
import { authRouter } from "./routes/auth";
import mongoose from "mongoose";
import { marketRouter } from "./routes/market";
import { resolveRouter } from "./routes/resolve";

const app = express();
app.use(express.json());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/", marketRouter);
app.use("/api/v1/", resolveRouter);

export const JWTSecretKey = process.env.SECRET_KEY as string;
const mongodbUri = process.env.MONGODB_URI as string;
if (!mongodbUri) {
    throw new Error("mongoDB uri not provided");
}
const PORT = process.env.PORT || 8000;

async function main() {
    await mongoose.connect(mongodbUri);
    console.log("MongoDB connected");

    app.listen(PORT, () => {
        console.log("server running on port: ", PORT);
    });
}
main().catch(console.error);
