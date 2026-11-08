import { describe, test, expect, beforeAll } from "bun:test";

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:8000";

// Update the prefix if your Express app uses a different one.
const ROUTES = {
    signup: "/api/v1/auth/signup",
    signin: "/api/v1/auth/signin",
    createMarket: "/api/v1/market",
    getMarkets: "/api/v1/markets",
};

const username = `mkt${crypto.randomUUID().slice(0, 8)}`;
const password = "Test@12345";

let token = "";
let marketId = "";

interface ApiResponse {
    message?: string;
    error?: string;
    id?: string;
    token?: string;
    marketId?: string;
    page?: number;
    limit?: number;
    markets?: Array<{
        _id: string;
        title: string;
        creatorId?: string;
        totalIssued: number;
        expiry: string;
        resolution: "yes" | "no" | null;
        matchingVersion: number;
        createdAt: string;
    }>;
}

async function request(
    route: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>,
    authToken?: string,
) {
    const url = `${BASE_URL}${route}`;

    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const raw = await response.text();

    let data: ApiResponse;

    try {
        data = JSON.parse(raw) as ApiResponse;
    } catch {
        throw new Error(
            `Server returned invalid JSON.
URL: ${url}
Status: ${response.status}
Response: ${raw.slice(0, 500)}`,
        );
    }

    return {
        status: response.status,
        data,
    };
}

function futureDate(days = 7) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pastDate(days = 1) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// creating user for test
beforeAll(async () => {
    const signup = await request(ROUTES.signup, "POST", {
        username,
        password,
        role: "user",
    });

    expect(signup.status).toBe(201);

    const login = await request(ROUTES.signin, "POST", {
        username,
        password,
    });

    expect(login.status).toBe(200);
    expect(login.data.token).toBeDefined();

    token = login.data.token!;
});

// create market
describe("Create Market", () => {
    test("should create a market successfully", async () => {
        const { status, data } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "Will Bitcoin reach 150k?",
                expiry: futureDate(),
            },
            token,
        );

        expect(status).toBe(201);
        expect(data.message).toBe("market created successfully");
        expect(data.marketId).toBeDefined();

        marketId = data.marketId!;
    });

    test("should reject title shorter than 3 characters", async () => {
        const { status, data } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "ab",
                expiry: futureDate(),
            },
            token,
        );

        expect(status).toBe(400);
        expect(data.message).toBe("invalid input");
    });

    test("should reject title longer than 50 characters", async () => {
        const { status } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "a".repeat(51),
                expiry: futureDate(),
            },
            token,
        );

        expect(status).toBe(400);
    });

    test("should reject missing title", async () => {
        const { status } = await request(
            ROUTES.createMarket,
            "POST",
            {
                expiry: futureDate(),
            },
            token,
        );

        expect(status).toBe(400);
    });

    test("should reject missing expiry", async () => {
        const { status } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "Will ETH reach 10k?",
            },
            token,
        );

        expect(status).toBe(400);
    });

    test("should reject invalid expiry date", async () => {
        const { status, data } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "Will ETH reach 10k?",
                expiry: "not-a-date",
            },
            token,
        );

        expect(status).toBe(400);
        expect(data.message).toBe("invalid input");
    });

    test("should reject past expiry date", async () => {
        const { status, data } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "Will ETH reach 10k?",
                expiry: pastDate(),
            },
            token,
        );

        expect(status).toBe(400);
        expect(data.message).toBe("expiry data can only be in the future");
    });

    test("should reject missing authentication", async () => {
        const { status } = await request(ROUTES.createMarket, "POST", {
            title: "Will Bitcoin reach 200k?",
            expiry: futureDate(),
        });

        expect(status).toBe(401);
    });

    test("should reject invalid JWT", async () => {
        const { status } = await request(
            ROUTES.createMarket,
            "POST",
            {
                title: "Will Bitcoin reach 200k?",
                expiry: futureDate(),
            },
            "invalid.jwt.token",
        );

        expect(status).toBe(401);
    });
});

// get all market
describe("Get All Markets", () => {
    test("should fetch markets created by user", async () => {
        const { status, data } = await request(
            ROUTES.getMarkets,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.message).toBe("fetched all the markets");
        expect(data.page).toBe(1);
        expect(data.limit).toBe(10);

        expect(Array.isArray(data.markets)).toBe(true);
        expect(data.markets?.length).toBe(1);
        expect(data.markets?.[0]._id).toBe(marketId);
    });

    test("should return correct market fields", async () => {
        const { status, data } = await request(
            ROUTES.getMarkets,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);

        const market = data.markets?.find((m) => m._id === marketId);

        expect(market).toBeDefined();
        expect(market?.title).toBe("Will Bitcoin reach 150k?");
        expect(market?.totalIssued).toBe(0);
        expect(market?.resolution).toBeNull();
        expect(market?.matchingVersion).toBe(0);
    });

    test("should create multiple markets for pagination", async () => {
        for (let i = 1; i <= 4; i++) {
            const { status } = await request(
                ROUTES.createMarket,
                "POST",
                {
                    title: `Test Market ${i}`,
                    expiry: futureDate(10 + i),
                },
                token,
            );

            expect(status).toBe(201);
        }

        const { status, data } = await request(
            ROUTES.getMarkets,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.markets?.length).toBe(5);
    });

    test("should return first page with limit 2", async () => {
        const { status, data } = await request(
            `${ROUTES.getMarkets}?page=1&limit=2`,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.page).toBe(1);
        expect(data.limit).toBe(2);
        expect(data.markets?.length).toBe(2);
    });

    test("should return second page with limit 2", async () => {
        const { status, data } = await request(
            `${ROUTES.getMarkets}?page=2&limit=2`,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.page).toBe(2);
        expect(data.limit).toBe(2);
        expect(data.markets?.length).toBe(2);
    });

    test("should return markets sorted newest first", async () => {
        const { status, data } = await request(
            ROUTES.getMarkets,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);

        const markets = data.markets ?? [];

        for (let i = 1; i < markets.length; i++) {
            expect(markets[i - 1]._id >= markets[i]._id).toBe(true);
        }
    });

    test("should reject invalid JWT", async () => {
        const { status } = await request(
            ROUTES.getMarkets,
            "GET",
            undefined,
            "invalid.jwt.token",
        );

        expect(status).toBe(401);
    });
});
