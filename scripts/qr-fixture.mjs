import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { sha256 } from "../functions/api/auth/_utils.js";
export async function fixture() {
    const db = new DatabaseSync(":memory:");
    for (const file of [
        "0003_create_auth_tables.sql",
        "0010_create_qr_studio_tables.sql",
        "0011_create_qr_logo_ownership.sql",
    ])
        db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    for (const id of ["alice", "bob"]) {
        db.prepare("INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)").run(
            id,
            `${id}@example.com`,
            id,
            "unused-test-hash",
        );
        db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)").run(
            id,
            id,
            await sha256(id),
            "2099-01-01T00:00:00.000Z",
        );
    }
    const env = {
        DB: {
            prepare(sql) {
                let args = [];
                const prepared = {
                    bind(...values) {
                        args = values;
                        return prepared;
                    },
                    async first() {
                        return db.prepare(sql).get(...args) || null;
                    },
                    async all() {
                        return { results: db.prepare(sql).all(...args) };
                    },
                    async run() {
                        const result = db.prepare(sql).run(...args);
                        return { meta: { changes: Number(result.changes) } };
                    },
                };
                return prepared;
            },
        },
    };
    async function call(
        module,
        method = "GET",
        value,
        params = {},
        user = "alice",
        path = "/api/qr-codes",
        origin = "https://issuedesk.test",
    ) {
        const headers = { Origin: origin, Cookie: user ? `issuedesk_session=${user}` : "" };
        const options = { method, headers };
        if (value !== undefined) {
            headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(value);
        }
        return module[`onRequest${method[0]}${method.slice(1).toLowerCase()}`]({
            request: new Request(`https://issuedesk.test${path}`, options),
            env,
            params,
        });
    }
    return { db, env, call };
}
