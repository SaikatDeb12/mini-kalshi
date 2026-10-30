import { test, expect } from "bun:test";
import axios from "axios";

const BACKEND_URL = "http://localhost:8000/api/auth";

const USERNAME = `takias-${Math.random()}`;

test("If username is small, the signup endpoint should return a 411 status code", async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/signup`, {
            username: "a",
            password: "asdasdadskjadskj",
        });

        expect.fail();
    } catch (e) {
        console.log(e.status);
        expect(e.status).toBe(404);
    }
});

test("If the username and pasword are not present it should return a 411", async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/signup`, {});

        expect.fail();
    } catch (e) {
        console.log(e.status);
        expect(e.status).toBe(404);
    }
});

test("If the username and pasword are not present it should return a 412", async () => {
    const res = await axios.post(`${BACKEND_URL}/signup`, {
        username: USERNAME,
        password: "123123",
    });
    expect(res.status).toBe(200);

    try {
        await axios.post(`${BACKEND_URL}/signup`, {
            username: USERNAME,
            password: "123123",
        });
    } catch (e) {
        console.log(e.status);
        expect(e.status).toBe(400);
    }
});
