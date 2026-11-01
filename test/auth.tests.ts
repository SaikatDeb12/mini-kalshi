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
        expect.fail();
    } catch (error) {
        console.log(error.status);
        expect(error.status).toBe(400);
    }
});

test("if username and password not present", async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/signup`, {});
        expect.fail();
    } catch (e) {
        console.log(e.status);
        expect(e.status).toBe(404);
    }
});

test("If the username and pasword are wrong it should return a 401", async () => {
    const res = await axios.post(`${BACKEND_URL}/signin`, {
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
