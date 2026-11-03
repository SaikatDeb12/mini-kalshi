import type { Types } from "mongoose";
type Outcome = "yes" | "no";

type BookRow = { _id: Types.ObjectId; outcome: Outcome };

type MatchOrder = {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    orderbookId: Types.ObjectId;
    type: OrderType;
    price: number; // cents per contract
    quantity: number;
    remainingQuantity: number;
    createdAt: Date;
};

type MatchContext = {
    session: ClientSession;
    marketId: Types.ObjectId;
    outcome: Outcome;
    incoming: MatchOrder;
};
type LogAction = "lock" | "buy" | "sell";

type LogDelta = {
    userId: Types.ObjectId;
    marketId: Types.ObjectId;
    orderId: Types.ObjectId;
    fillId?: Types.ObjectId;
    outcome: Outcome;
    action: LogAction;
    qtyChange: number;
    lockedQtyChange: number;
    balanceUSDChange: number;
    lockedUSDChange: number;
};
