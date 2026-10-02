//Tests for the Vercel function api/read-cube.js with a fake Anthropic client:
//the request it builds, how it parses the model's JSON answer, and how the
//HTTP handler validates input. Needs "npm install" at the repository root.
import {test} from "node:test";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {CubieCube, Random} from "../solver.js";
import {readingFromFacelets} from "../aiRead.js";

const here = dirname(fileURLToPath(import.meta.url));
const api = await import(join(here, "..", "..", "..", "..", "api", "read-cube.js"));

function fakeClient(answer, extra = {}){
    const calls = [];
    return {
        calls,
        beta: {messages: {create: async params => {
            calls.push(params);
            return {model: "claude-opus-5-5", stop_reason: "end_turn", usage: {input_tokens: 3000, output_tokens: 400},
                    content: [{type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer)}], ...extra};
        }}}
    };
}

const photos = [{data: "AAAA", mediaType: "image/jpeg"}, {data: "BBBB", mediaType: "image/png"}];

test("readCube sends both photos, the instructions and the JSON schema", async () => {
    const facelets = CubieCube.random(new Random(1)).toFacelets();
    const client = fakeClient(readingFromFacelets(facelets));
    const result = await api.readCube(photos, client);
    assert.equal(client.calls.length, 1);
    const params = client.calls[0];
    assert.equal(params.model, "claude-opus-5-5");
    assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(params.fallbacks, "default");
    assert.equal(params.output_config.format.type, "json_schema");
    const content = params.messages[0].content;
    const images = content.filter(b => b.type === "image");
    assert.equal(images.length, 2);
    assert.equal(images[0].source.media_type, "image/jpeg");
    assert.equal(images[1].source.data, "BBBB");
    assert.ok(content[content.length - 1].text.includes("grid[0][0]"));
    assert.equal(result.photos.length, 2);
    assert.equal(result.model, "claude-opus-5-5");
});

test("readCube rejects refusals, bad JSON and incomplete answers", async () => {
    await assert.rejects(api.readCube(photos, fakeClient("{}", {stop_reason: "refusal", stop_details: {explanation: "no"}})), /declined/);
    await assert.rejects(api.readCube(photos, fakeClient("not json")), /not valid JSON/);
    await assert.rejects(api.readCube(photos, fakeClient({photos: [{faces: []}, {faces: []}]})), /incomplete/);
    //Unusable corner guesses are dropped, the colours kept.
    const reading = readingFromFacelets(CubieCube.random(new Random(2)).toFacelets());
    reading.photos[0].corners = {near: [2, 2], outer: []};
    const result = await api.readCube(photos, fakeClient(reading));
    assert.equal(result.photos[0].corners, null);
});

test("the handler validates method, key and body", async () => {
    const responses = [];
    const res = {status(code){ this.code = code; return this; }, json(body){ responses.push([this.code, body]); }};
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await api.default({method: "GET"}, res);
    assert.equal(responses.at(-1)[0], 405);
    await api.default({method: "POST", body: {photos}}, res);
    assert.equal(responses.at(-1)[0], 503);
    process.env.ANTHROPIC_API_KEY = "test-key";
    await api.default({method: "POST", body: {photos: [photos[0]]}}, res);
    assert.equal(responses.at(-1)[0], 400);
    await api.default({method: "POST", body: {photos: [photos[0], {data: "x", mediaType: "image/gif"}]}}, res);
    assert.equal(responses.at(-1)[0], 400);
    await api.default({method: "POST", body: {photos: [photos[0], {data: "x".repeat(2 * 1024 * 1024), mediaType: "image/jpeg"}]}}, res);
    assert.equal(responses.at(-1)[0], 413);
    if(saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
});
