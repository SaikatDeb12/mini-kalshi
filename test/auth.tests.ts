import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:8000";

const ROUTES = {
    signup: "/api/v1/auth/signup",
    signin: "/api/v1/auth/signin",
    onramp: "/api/v1/auth/onramp",
    profile: "/api/v1/auth/profile",
    transactions: "/api/v1/auth/transactions",
};

// username must be between 3 and 15 characters
const username = `test${crypto.randomUUID().slice(0, 8)}`;
const password = "Test@12345";

let token = "";
let userId = "";
let currentBalance = 0;

interface ApiResponse {
    message?: string;
    error?: string;
    id?: string;
    role?: string;
    token?: string;
    balance?: number;
    user?: {
        _id: string;
        username: string;
        role: string;
        availableUSD: number;
        lockedUSD: number;
        matchedCount: number;
        password?: string;
    };
    page?: number;
    limit?: number;
    transactions?: Array<{
        _id: string;
        userId: string;
        action: string;
        qtyChange: number;
        balanceUSDChange: number;
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
Content-Type: ${response.headers.get("content-type")}
Response: ${raw.slice(0, 500)}`,
        );
    }

    return {
        status: response.status,
        data,
    };
}

// register user
describe("Register User", () => {
    test("should register a new user", async () => {
        const { status, data } = await request(ROUTES.signup, "POST", {
            username,
            password,
            role: "user",
        });

        expect(status).toBe(201);
        expect(data.message).toBe("user created successfully");
        expect(data.id).toBeDefined();
        expect(data.role).toBe("user");

        userId = data.id!;
    });

    test("should reject duplicate username", async () => {
        const { status, data } = await request(ROUTES.signup, "POST", {
            username,
            password,
            role: "user",
        });

        expect(status).toBe(400);
        expect(data.message).toBe("user with this username already exists");
    });

    test("should reject username shorter than 3 characters", async () => {
        const { status, data } = await request(ROUTES.signup, "POST", {
            username: "ab",
            password,
            role: "user",
        });

        expect(status).toBe(400);
        expect(data.message).toBe("invalid input");
    });

    test("should reject username longer than 15 characters", async () => {
        const { status } = await request(ROUTES.signup, "POST", {
            username: "abcdefghijklmnop",
            password,
            role: "user",
        });

        expect(status).toBe(400);
    });

    test("should reject password shorter than 8 characters", async () => {
        const { status } = await request(ROUTES.signup, "POST", {
            username: "validuser",
            password: "1234567",
            role: "user",
        });

        expect(status).toBe(400);
    });

    test("should reject password longer than 20 characters", async () => {
        const { status } = await request(ROUTES.signup, "POST", {
            username: "validuser",
            password: "123456789012345678901",
            role: "user",
        });

        expect(status).toBe(400);
    });

    test("should reject invalid role", async () => {
        const { status } = await request(ROUTES.signup, "POST", {
            username: "validuser",
            password,
            role: "superadmin",
        });

        expect(status).toBe(400);
    });

    test("should reject missing role", async () => {
        const { status } = await request(ROUTES.signup, "POST", {
            username: "validuser",
            password,
        });

        expect(status).toBe(400);
    });
});

// login user
describe("Login User", () => {
    test("should login successfully", async () => {
        const { status, data } = await request(ROUTES.signin, "POST", {
            username,
            password,
        });

        expect(status).toBe(200);
        expect(data.message).toBe("user logged in successfully");
        expect(typeof data.token).toBe("string");

        token = data.token!;
    });

    test("should reject incorrect password", async () => {
        const { status, data } = await request(ROUTES.signin, "POST", {
            username,
            password: "WrongPass123",
        });

        expect(status).toBe(401);
        expect(data.message).toBe("invalid credentials");
    });

    test("should reject nonexistent user", async () => {
        const { status, data } = await request(ROUTES.signin, "POST", {
            username: "missinguser123",
            password,
        });

        expect(status).toBe(401);
        expect(data.message).toBe("invalid credentials");
    });

    test("should reject invalid username", async () => {
        const { status } = await request(ROUTES.signin, "POST", {
            username: "ab",
            password,
        });

        expect(status).toBe(401);
    });

    test("should reject invalid password", async () => {
        const { status } = await request(ROUTES.signin, "POST", {
            username,
            password: "123",
        });

        expect(status).toBe(401);
    });
});

// onramp
describe("OnRamp", () => {
    test("should add 1000 to user balance", async () => {
        const { status, data } = await request(
            ROUTES.onramp,
            "POST",
            { amount: 1000 },
            token,
        );

        expect(status).toBe(200);
        expect(data.message).toBe("balance added successfully");
        expect(data.balance).toBe(1000);

        currentBalance = data.balance!;
    });

    test("should accumulate balance correctly", async () => {
        const { status, data } = await request(
            ROUTES.onramp,
            "POST",
            { amount: 500 },
            token,
        );

        expect(status).toBe(200);
        expect(data.balance).toBe(currentBalance + 500);

        currentBalance = data.balance!;
    });

    test("should reject negative amount", async () => {
        const { status, data } = await request(
            ROUTES.onramp,
            "POST",
            { amount: -100 },
            token,
        );

        expect(status).toBe(400);
        expect(data.message).toBe("invalid input");
    });

    test("should reject zero amount", async () => {
        const { status } = await request(
            ROUTES.onramp,
            "POST",
            { amount: 0 },
            token,
        );

        expect(status).toBe(400);
    });

    test("should reject decimal amount", async () => {
        const { status } = await request(
            ROUTES.onramp,
            "POST",
            { amount: 10.5 },
            token,
        );

        expect(status).toBe(400);
    });

    test("should reject string amount", async () => {
        const { status } = await request(
            ROUTES.onramp,
            "POST",
            { amount: "1000" },
            token,
        );

        expect(status).toBe(400);
    });

    test("should reject missing amount", async () => {
        const { status } = await request(ROUTES.onramp, "POST", {}, token);

        expect(status).toBe(400);
    });
});

// getprofile/
describe("Get Profile", () => {
    test("should return correct user profile", async () => {
        const { status, data } = await request(
            ROUTES.profile,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.message).toBe("user found");

        expect(data.user?._id).toBe(userId);
        expect(data.user?.username).toBe(username);
        expect(data.user?.role).toBe("user");
        expect(data.user?.availableUSD).toBe(1500);
        expect(data.user?.lockedUSD).toBe(0);
        expect(data.user?.matchedCount).toBe(0);
    });

    test("should not expose password", async () => {
        const { status, data } = await request(
            ROUTES.profile,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.user?.password).toBeUndefined();
    });
});

// transactions
describe("Transaction History", () => {
    test("should fetch transaction history", async () => {
        const { status, data } = await request(
            ROUTES.transactions,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.page).toBe(1);
        expect(data.limit).toBe(10);
        expect(Array.isArray(data.transactions)).toBe(true);
        expect(data.transactions?.length).toBe(2);
    });

    test("should contain correct onramp logs", async () => {
        const { status, data } = await request(
            ROUTES.transactions,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);

        const logs = data.transactions ?? [];

        expect(logs.every((log) => log.action === "onramp")).toBe(true);

        const amounts = logs.map((log) => log.balanceUSDChange);

        expect(amounts).toContain(1000);
        expect(amounts).toContain(500);
    });

    test("should return paginated transactions", async () => {
        const { status, data } = await request(
            `${ROUTES.transactions}?page=1&limit=1`,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(200);
        expect(data.page).toBe(1);
        expect(data.limit).toBe(1);
        expect(data.transactions?.length).toBe(1);
    });

    test("should reject non-integer pagination", async () => {
        const { status, data } = await request(
            `${ROUTES.transactions}?page=abc&limit=10`,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(400);
        expect(data.message).toBe("invalid pagination");
    });

    test("should reject decimal pagination", async () => {
        const { status } = await request(
            `${ROUTES.transactions}?page=1.5&limit=10`,
            "GET",
            undefined,
            token,
        );

        expect(status).toBe(400);
    });
});
