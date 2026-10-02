//Drives the built page (dist/index.html) in headless Chromium, with a fake
//webcam that shows synthetic cube photos, and checks the whole live flow:
//take photo 1 on the guide, take photo 2, valid cube, solved.
//Optional check, not part of "npm test": it needs Playwright and Chromium.
//    node bundle.mjs && node tests/browser-check.cjs
const path = require("node:path");
const zlib = require("node:zlib");
const {pathToFileURL} = require("node:url");

//Minimal PNG writer (RGBA, no filtering) so the synthetic photos can be
//handed to the page as data URLs.
function crc32(buf){
    let crc = 0xffffffff;
    for(let n = 0; n < buf.length; n++){
        let c = (crc ^ buf[n]) & 0xff;
        for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data){
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function pngDataUrl(image){
    const {width, height, data} = image;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for(let y = 0; y < height; y++){
        raw[y * (width * 4 + 1)] = 0;
        Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    return "data:image/png;base64," + png.toString("base64");
}

(async () => {
    const {chromium} = require("playwright");
    const here = __dirname;
    const {CubieCube, Random} = await import(pathToFileURL(path.join(here, "..", "solver.js")).href);
    const {renderCornerPhoto, guideAlignedCamera} = await import(pathToFileURL(path.join(here, "..", "render.js")).href);

    //Two photos of one random cube, taken exactly on the guide.
    const rng = new Random(Date.now() >>> 0);
    const facelets = CubieCube.random(rng).toFacelets();
    const size = 480;
    const photo1 = pngDataUrl(renderCornerPhoto(facelets, [1, 1, 1], rng, {width: size, height: size, camera: guideAlignedCamera(size, [1, 1, 1], 0)}).image);
    const photo2 = pngDataUrl(renderCornerPhoto(facelets, [-1, -1, -1], rng, {width: size, height: size, camera: guideAlignedCamera(size, [-1, -1, -1], Math.PI)}).image);

    const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"]});
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const errors = [];
    page.on("pageerror", e => errors.push("pageerror: " + e.message));
    page.on("console", m => { if(m.type() === "error" && !/ERR_CERT|fonts/.test(m.text())) errors.push("console: " + m.text()); });

    //Fake webcam: getUserMedia returns a stream from a canvas the test paints.
    await page.addInitScript(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 480; canvas.height = 480;
        const ctx = canvas.getContext("2d");
        let img = null;
        window.__fakeCamera = {
            setImage: url => new Promise(resolve => { const im = new Image(); im.onload = () => { img = im; resolve(); }; im.src = url; })
        };
        setInterval(() => {
            if(img) ctx.drawImage(img, 0, 0);
            else { ctx.fillStyle = "#777"; ctx.fillRect(0, 0, 480, 480); }
        }, 100);
        navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(10);
        navigator.mediaDevices.enumerateDevices = async () => [{kind: "videoinput", deviceId: "fake"}];
    });

    //Serve dist/ over http so the page's fetch("api/read-cube") can be routed.
    const fs = require("node:fs");
    const http = require("node:http");
    const server = http.createServer((req, res) => {
        if(req.url === "/favicon.ico"){ res.writeHead(204); res.end(); return; }
        const file = path.join(here, "..", "dist", req.url === "/" ? "index.html" : req.url.split("?")[0]);
        if(!fs.existsSync(file)){ res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, {"Content-Type": file.endsWith(".html") ? "text/html" : "application/octet-stream"});
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(baseUrl + "index.html");
    await page.waitForFunction(() => /Found \d+ moves/.test(document.getElementById("solver-status").textContent), null, {timeout: 60000});

    async function take(index, url){
        await page.evaluate(u => window.__fakeCamera.setImage(u), url);
        await page.click(`#photo-take-${index}`);
        await page.waitForSelector(`#photo-card-${index}.capturing`);
        await page.waitForFunction(i => document.getElementById(`photo-video-${i}`).videoWidth > 0, index);
        await page.waitForTimeout(700);//let the live sampling run a few times
        if(index === 0) await page.screenshot({path: path.join(here, "..", "dist", "check-live.png"), clip: {x: 300, y: 380, width: 700, height: 520}});
        await page.click(`#photo-capture-${index}`);
        await page.waitForSelector(`#photo-card-${index}.has-photo:not(.capturing)`);
    }
    await take(0, photo1);
    console.log("photo 1:", await page.textContent("#photo-badge-0"), "|", await page.textContent("#photo-status-0"));
    await take(1, photo2);
    console.log("photo 2:", await page.textContent("#photo-badge-1"), "|", await page.textContent("#photo-status-1"));
    const message = await page.textContent("#net-message");
    console.log("net:", message);
    await page.click("#solve-button");
    await page.waitForFunction(() => /Found \d+ moves|failed|already solved/.test(document.getElementById("solver-status").textContent), null, {timeout: 60000});
    console.log("solve:", await page.textContent("#solver-status"));
    //Cancel path: start and cancel the camera on card 1, the photo must survive.
    await page.click("#photo-take-1");
    await page.waitForSelector("#photo-card-1.capturing");
    await page.click("#photo-cancel-1");
    await page.waitForSelector("#photo-card-1.has-photo:not(.capturing)");
    console.log("after cancel:", await page.textContent("#photo-badge-1"));
    //Read with AI, against a mocked server that answers like a perfect model
    //(the real function is api/read-cube.js; see tests/api.test.js).
    const {readingFromFacelets} = await import(pathToFileURL(path.join(here, "..", "aiRead.js")).href);
    let request = null;
    await page.route("**/api/read-cube", async route => {
        request = JSON.parse(route.request().postData());
        await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({...readingFromFacelets(facelets), model: "mock"})});
    });
    await page.click("#ai-button");
    await page.waitForFunction(() => /^Read with AI: |failed|needs the hosted/.test(document.getElementById("net-message").textContent), null, {timeout: 20000});
    const aiMessage = await page.textContent("#net-message");
    console.log("ai:", aiMessage, "| sent", request ? `${request.photos.length} photos, ${request.photos[0].mediaType}, ${Math.round(request.photos[0].data.length / 1024)} KB each` : "nothing");
    await page.screenshot({path: path.join(here, "..", "dist", "check-page.png"), fullPage: true});
    console.log("errors:", errors.length ? errors.join("\n") : "none");
    await browser.close();
    server.close();
    const ok = message.startsWith("Valid cube") && aiMessage.includes("Valid cube") && errors.length === 0;
    process.exit(ok ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
