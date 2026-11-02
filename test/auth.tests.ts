import { test, expect } from "bun:test";
import axios from "axios";

const BACKEND_URL = "http://localhost:8000/api/v1/auth";

const USERNAME = `takias-${Math.random()}`;

test("if the length of username < 3", async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/signup`, {
            username: "a",
            password: "asdasdadskjadskj",
        });
        expect.fail("expect 400");
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.log(error.message);
            expect(error.response?.status).toBe(400);
        } else {
            throw error;
        }
    }
});

test("if username and password not present", async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/signup`, {});
        expect.fail();
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.log(error.message);
            expect(error.response?.status).toBe(400);
        } else {
            throw error;
        }
    }
});

test("If the username and pasword are wrong it should return a 401", async () => {
    const res = await axios.post(`${BACKEND_URL}/signup`, {
        username: USERNAME,
        password: "123123",
    });
    expect(res.status).toBe(201);

    try {
        await axios.post(`${BACKEND_URL}/signin`, {
            username: USERNAME,
            password: "123123",
        });
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.log(error.status);
            expect(error.status).toBe(401);
        } else {
            throw error;
        }
    }
});
