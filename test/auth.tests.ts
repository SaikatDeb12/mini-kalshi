import { describe, test, expect, beforeAll } from "bun:test";
import axios from "axios";

const api = axios.create({
    baseURL: "http://localhost:8000/api/v1/auth",
    validateStatus: () => true,
});

const USERNAME = `test-${crypto.randomUUID()}`;
const PASSWORD = "TestPassword123!";

let token: string;

beforeAll(async () => {
    // Create a user for login and authenticated tests
    const signup = await api.post("/signup", {
        username: USERNAME,
        password: PASSWORD,
    });

    expect(signup.status).toBe(201);

    const login = await api.post("/signin", {
        username: USERNAME,
        password: PASSWORD,
    });

    expect(login.status).toBe(200);
    token = login.data.token;
});

describe("Signup", () => {
    test("should reject username shorter than 3 characters", async () => {
        const res = await api.post("/signup", {
            username: "a",
            password: PASSWORD,
        });

        expect(res.status).toBe(400);
    });

    test("should reject missing username and password", async () => {
        const res = await api.post("/signup", {});

        expect(res.status).toBe(400);
    });

    test("should reject short password", async () => {
        const res = await api.post("/signup", {
            username: `user-${crypto.randomUUID()}`,
            password: "123",
        });

        expect(res.status).toBe(400);
    });

    test("should reject duplicate username", async () => {
        const res = await api.post("/signup", {
            username: USERNAME,
            password: PASSWORD,
        });

        expect(res.status).toBe(400);
    });

    test("should register a new user successfully", async () => {
        const res = await api.post("/signup", {
            username: `new-${crypto.randomUUID()}`,
            password: PASSWORD,
        });

        expect(res.status).toBe(201);
        expect(res.data.id).toBeDefined();
        expect(res.data.message).toBe("user created successfully");
    });
});

describe("Signin", () => {
    test("should reject unknown username", async () => {
        const res = await api.post("/signin", {
            username: `unknown-${crypto.randomUUID()}`,
            password: PASSWORD,
        });

        expect(res.status).toBe(401);
    });

    test("should reject incorrect password", async () => {
        const res = await api.post("/signin", {
            username: USERNAME,
            password: "WrongPassword123!",
        });

        expect(res.status).toBe(401);
    });

    test("should reject missing credentials", async () => {
        const res = await api.post("/signin", {});

        expect(res.status).toBe(401);
    });

    test("should login successfully and return token", async () => {
        const res = await api.post("/signin", {
            username: USERNAME,
            password: PASSWORD,
        });

        expect(res.status).toBe(200);
        expect(res.data.token).toBeString();
        expect(res.data.token.length).toBeGreaterThan(0);
    });
});

describe("Profile", () => {
    test("should reject request without token", async () => {
        const res = await api.get("/profile");

        expect(res.status).toBe(401);
    });

    test("should reject invalid token", async () => {
        const res = await api.get("/profile", {
            headers: {
                Authorization: "Bearer invalid-token",
            },
        });

        expect(res.status).toBe(401);
    });

    test("should return user profile without password", async () => {
        const res = await api.get("/profile", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        expect(res.status).toBe(200);
        expect(res.data.user.username).toBe(USERNAME);
        expect(res.data.user.password).toBeUndefined();
    });
});

describe("OnRamp", () => {
    test("should reject negative amount", async () => {
        const res = await api.post(
            "/onramp",
            { amount: -100 },
            { headers: { Authorization: `Bearer ${token}` } },
        );

        expect(res.status).toBe(400);
    });

    test("should reject decimal amount", async () => {
        const res = await api.post(
            "/onramp",
            { amount: 10.5 },
            { headers: { Authorization: `Bearer ${token}` } },
        );

        expect(res.status).toBe(400);
    });

    test("should reject missing amount", async () => {
        const res = await api.post(
            "/onramp",
            {},
            { headers: { Authorization: `Bearer ${token}` } },
        );

        expect(res.status).toBe(400);
    });

    test("should add balance successfully", async () => {
        const res = await api.post(
            "/onramp",
            { amount: 100 },
            { headers: { Authorization: `Bearer ${token}` } },
        );

        expect(res.status).toBe(200);
        expect(res.data.balance).toBe(100);
    });
});
