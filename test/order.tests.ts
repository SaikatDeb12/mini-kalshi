import { describe, test, expect, beforeAll } from "bun:test";

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:8000";

// Adjust paths to match your Express app.use() prefixes.
const ROUTES = {
    signup: "/api/v1/auth/signup",
    signin: "/api/v1/auth/signin",
    onramp: "/api/v1/auth/onramp",
    market: "/api/v1/market",
    order: (id: string) => `/api/v1/order/${id}`,
    profile: "/api/v1/auth/profile",
};

type Side = "yes" | "no";
type OrderType = "buy" | "sell";
type OrderStatus = "open" | "partial" | "filled";

interface OrderResult {
    orderId: string;
    marketId: string;
    type: OrderType;
    side: Side;
    price: number;
    requestedQty: number;
    filledQty: number;
    remainingQty: number;
    status: OrderStatus;
}

interface ApiResponse {
    message?: string;
    error?: string;
    id?: string;
    token?: string;
    marketId?: string;
    balance?: number;
    result?: OrderResult;
    user?: {
        availableUSD: number;
        lockedUSD: number;
    };
}

interface TestUser {
    username: string;
    token: string;
}

let creator: TestUser;
let alice: TestUser;
let bob: TestUser;

const password = "Test@12345";

async function request(
    route: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>,
    token?: string,
) {
    const url = `${BASE_URL}${route}`;

    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const raw = await response.text();

    let data: ApiResponse;

    try {
        data = JSON.parse(raw) as ApiResponse;
    } catch {
        throw new Error(
            `Invalid JSON response
URL: ${url}
Status: ${response.status}
Body: ${raw.slice(0, 500)}`,
        );
    }

    return {
        status: response.status,
        data,
    };
}

function futureDate(days = 7) {
    return new Date(Date.now() + days * 86400000).toISOString();
}

async function createUser(): Promise<TestUser> {
    const username = `u${crypto.randomUUID().slice(0, 10)}`;

    const signup = await request(ROUTES.signup, "POST", {
        username,
        password,
        role: "user",
    });

    expect(signup.status).toBe(201);

    const login = await request(ROUTES.signin, "POST", { username, password });

    expect(login.status).toBe(200);
    expect(login.data.token).toBeDefined();

    return {
        username,
        token: login.data.token!,
    };
}

async function createMarket() {
    const response = await request(
        ROUTES.market,
        "POST",
        {
            title: `Test market ${crypto.randomUUID().slice(0, 8)}`,
            expiry: futureDate(),
        },
        creator.token,
    );

    expect(response.status).toBe(201);
    expect(response.data.marketId).toBeDefined();

    return response.data.marketId!;
}

async function placeOrder(
    user: TestUser,
    marketId: string,
    side: Side,
    type: OrderType,
    price: number,
    quantity: number,
) {
    return request(
        ROUTES.order(marketId),
        "POST",
        { side, type, price, quantity },
        user.token,
    );
}

async function getBalance(user: TestUser) {
    const response = await request(
        ROUTES.profile,
        "GET",
        undefined,
        user.token,
    );

    expect(response.status).toBe(200);
    expect(response.data.user).toBeDefined();

    return response.data.user!;
}

// ==================================================
// SETUP
// ==================================================

beforeAll(async () => {
    creator = await createUser();
    alice = await createUser();
    bob = await createUser();

    for (const user of [alice, bob]) {
        const response = await request(
            ROUTES.onramp,
            "POST",
            { amount: 100000 },
            user.token,
        );

        expect(response.status).toBe(200);
    }
});

// ==================================================
// 1. ORDER VALIDATION
// ==================================================

describe("Order Validation", () => {
    let marketId: string;

    beforeAll(async () => {
        marketId = await createMarket();
    });

    test("should reject invalid market ID", async () => {
        const response = await placeOrder(
            alice,
            "invalid-id",
            "yes",
            "buy",
            60,
            10,
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("invalid market Id");
    });

    test("should reject nonexistent market", async () => {
        const response = await placeOrder(
            alice,
            "507f1f77bcf86cd799439011",
            "yes",
            "buy",
            60,
            10,
        );

        expect(response.status).toBe(404);
        expect(response.data.message).toBe("market not found");
    });

    test("should reject price below 1", async () => {
        const response = await placeOrder(alice, marketId, "yes", "buy", 0, 10);

        expect(response.status).toBe(400);
    });

    test("should reject price above 99", async () => {
        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "buy",
            100,
            10,
        );

        expect(response.status).toBe(400);
    });

    test("should reject decimal price", async () => {
        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "buy",
            50.5,
            10,
        );

        expect(response.status).toBe(400);
    });

    test("should reject negative quantity", async () => {
        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "buy",
            50,
            -5,
        );

        expect(response.status).toBe(400);
    });

    test("should reject decimal quantity", async () => {
        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "buy",
            50,
            2.5,
        );

        expect(response.status).toBe(400);
    });

    test("should reject invalid side", async () => {
        const response = await request(
            ROUTES.order(marketId),
            "POST",
            {
                side: "maybe",
                type: "buy",
                price: 50,
                quantity: 10,
            },
            alice.token,
        );

        expect(response.status).toBe(400);
    });

    test("should reject invalid type", async () => {
        const response = await request(
            ROUTES.order(marketId),
            "POST",
            {
                side: "yes",
                type: "hold",
                price: 50,
                quantity: 10,
            },
            alice.token,
        );

        expect(response.status).toBe(400);
    });

    test("should reject missing fields", async () => {
        const response = await request(
            ROUTES.order(marketId),
            "POST",
            { side: "yes" },
            alice.token,
        );

        expect(response.status).toBe(400);
    });

    test("should reject creator trading own market", async () => {
        const response = await placeOrder(
            creator,
            marketId,
            "yes",
            "buy",
            50,
            10,
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe(
            "creator cannot bet against there own market",
        );
    });

    test("should reject unauthenticated request", async () => {
        const response = await request(ROUTES.order(marketId), "POST", {
            side: "yes",
            type: "buy",
            price: 50,
            quantity: 10,
        });

        expect(response.status).toBe(401);
    });

    test("should reject invalid JWT", async () => {
        const response = await request(
            ROUTES.order(marketId),
            "POST",
            {
                side: "yes",
                type: "buy",
                price: 50,
                quantity: 10,
            },
            "invalid.jwt.token",
        );

        expect(response.status).toBe(401);
    });
});

// ==================================================
// 2. BUY ORDER AND BALANCE LOCKING
// ==================================================

describe("BUY Order", () => {
    test("should create open BUY order and lock funds", async () => {
        const marketId = await createMarket();
        const before = await getBalance(alice);

        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "buy",
            60,
            10,
        );

        expect(response.status).toBe(200);
        expect(response.data.message).toBe("order placed successfully");

        expect(response.data.result).toMatchObject({
            type: "buy",
            side: "yes",
            price: 60,
            requestedQty: 10,
            filledQty: 0,
            remainingQty: 10,
            status: "open",
        });

        expect(response.data.result?.orderId).toBeDefined();

        const after = await getBalance(alice);

        expect(after.availableUSD).toBe(before.availableUSD - 600);
        expect(after.lockedUSD).toBe(before.lockedUSD + 600);
    });

    test("should reject BUY with insufficient balance", async () => {
        const marketId = await createMarket();

        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "buy",
            99,
            1000000,
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("insufficient balance");
    });
});

// ==================================================
// 3. SELL ORDER
// ==================================================

describe("SELL Order", () => {
    test("should reject SELL without stocks", async () => {
        const marketId = await createMarket();

        const response = await placeOrder(
            alice,
            marketId,
            "yes",
            "sell",
            40,
            10,
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("insufficient stocks");
    });
});

// ==================================================
// 4. MINT MATCHING
// ==================================================

describe("MINT Matching", () => {
    test("should mint YES and NO when prices cross", async () => {
        const marketId = await createMarket();

        // Alice BUY NO @ 45 x 10
        const maker = await placeOrder(alice, marketId, "no", "buy", 45, 10);

        expect(maker.status).toBe(200);
        expect(maker.data.result?.status).toBe("open");

        // Bob BUY YES @ 60 x 10
        // 60 + 45 >= 100 => MINT
        const taker = await placeOrder(bob, marketId, "yes", "buy", 60, 10);

        expect(taker.status).toBe(200);
        expect(taker.data.result).toMatchObject({
            filledQty: 10,
            remainingQty: 0,
            status: "filled",
        });
    });

    test("should not mint when combined prices below 100", async () => {
        const marketId = await createMarket();

        await placeOrder(alice, marketId, "no", "buy", 40, 10);

        const response = await placeOrder(bob, marketId, "yes", "buy", 50, 10);

        expect(response.status).toBe(200);
        expect(response.data.result).toMatchObject({
            filledQty: 0,
            remainingQty: 10,
            status: "open",
        });
    });

    test("should partially mint when quantities differ", async () => {
        const marketId = await createMarket();

        // Maker: BUY NO x 3
        await placeOrder(alice, marketId, "no", "buy", 45, 3);

        // Taker: BUY YES x 10
        const response = await placeOrder(bob, marketId, "yes", "buy", 60, 10);

        expect(response.status).toBe(200);
        expect(response.data.result).toMatchObject({
            requestedQty: 10,
            filledQty: 3,
            remainingQty: 7,
            status: "partial",
        });
    });
});

// ==================================================
// 5. TRANSFER MATCHING
// ==================================================

describe("TRANSFER Matching", () => {
    test("should transfer YES stocks from seller to buyer", async () => {
        const marketId = await createMarket();

        // First mint contracts to Alice.
        await placeOrder(alice, marketId, "yes", "buy", 60, 10);
        await placeOrder(bob, marketId, "no", "buy", 40, 10);

        // Alice now owns 10 YES.
        // Alice SELL YES @ 55
        const sell = await placeOrder(alice, marketId, "yes", "sell", 55, 5);

        expect(sell.status).toBe(200);
        expect(sell.data.result?.status).toBe("open");

        // Bob BUY YES @ 60
        const buy = await placeOrder(bob, marketId, "yes", "buy", 60, 5);

        expect(buy.status).toBe(200);
        expect(buy.data.result).toMatchObject({
            filledQty: 5,
            remainingQty: 0,
            status: "filled",
        });
    });

    test("should not transfer if buy price below sell price", async () => {
        const marketId = await createMarket();

        // Give Alice YES contracts via mint.
        await placeOrder(alice, marketId, "yes", "buy", 60, 5);
        await placeOrder(bob, marketId, "no", "buy", 40, 5);

        await placeOrder(alice, marketId, "yes", "sell", 70, 5);

        const response = await placeOrder(bob, marketId, "yes", "buy", 60, 5);

        expect(response.status).toBe(200);
        expect(response.data.result).toMatchObject({
            filledQty: 0,
            remainingQty: 5,
            status: "open",
        });
    });

    test("should partially transfer stocks", async () => {
        const marketId = await createMarket();

        // Mint 10 YES to Alice.
        await placeOrder(alice, marketId, "yes", "buy", 60, 10);
        await placeOrder(bob, marketId, "no", "buy", 40, 10);

        // Alice sells 3 YES.
        await placeOrder(alice, marketId, "yes", "sell", 50, 3);

        // Bob buys 8 YES.
        const response = await placeOrder(bob, marketId, "yes", "buy", 60, 8);

        expect(response.status).toBe(200);
        expect(response.data.result).toMatchObject({
            filledQty: 3,
            remainingQty: 5,
            status: "partial",
        });
    });
});

// ==================================================
// 6. SELF-TRADE PREVENTION
// ==================================================

describe("Self Trade Prevention", () => {
    test("should not match user's own opposite BUY orders", async () => {
        const marketId = await createMarket();

        await placeOrder(alice, marketId, "yes", "buy", 60, 5);

        const response = await placeOrder(alice, marketId, "no", "buy", 45, 5);

        expect(response.status).toBe(200);
        expect(response.data.result).toMatchObject({
            filledQty: 0,
            remainingQty: 5,
            status: "open",
        });
    });
});
