//Page logic: photos in, keypoints, sticker net, solve, playback.
import {CubieCube, Random, Facelets, Moves, FACE_NAMES, Solver} from "./solver.js";
import {faceQuads, normalizeRing, topFaceOrder, homography, applyHomography, QUAD_GRID} from "./geometry.js";
import {renderCornerPhoto, STICKER_RGB} from "./render.js";
import {sampleFaces, reconstruct, autoDetectKeypoints, defaultKeypoints, guideKeypoints, PHOTO1_FACES, sampleFaceletIndex} from "./vision.js";
import {CubeView} from "./cube3d.js";
import {samplesFromReading, keypointsFromCorners, validatePhotoReading} from "./aiRead.js";

const $ = id => document.getElementById(id);

const state = {
    photos: [null, null],      //{image, keypoints, canvas, samples, sample: bool}
    facelets: null,            //current 54-letter string shown in the net
    classRgb: null,            //colour of each face's centre, as read from the photos
    selectedColour: 0,         //face index used when painting stickers
    solution: null,            //array of move indices
    solveStart: null,          //facelets the solution starts from
    busy: false
};

//---- solver in a worker ----------------------------------------------------

const solverLink = (() => {
    let worker = null, ready = false, nextId = 1;
    const pending = new Map();
    const fallback = {solver: null};
    const status = $("solver-status");
    function startWorker(){
        try{
            const inline = document.getElementById("worker-source");
            if(inline){
                //Single-file build: the worker code is embedded in the page.
                const blob = new Blob([inline.textContent], {type: "text/javascript"});
                worker = new Worker(URL.createObjectURL(blob));
            }else{
                worker = new Worker(new URL("./worker.js", import.meta.url), {type: "module"});
            }
            worker.onmessage = e => {
                const msg = e.data;
                if(msg.type === "ready"){
                    ready = true;
                    status.textContent = `Solver ready (tables built in ${(msg.ms / 1000).toFixed(1)} s).`;
                    document.dispatchEvent(new Event("solver-ready"));
                }else if(msg.type === "solution" || msg.type === "error"){
                    const p = pending.get(msg.id);
                    pending.delete(msg.id);
                    if(!p) return;
                    if(msg.type === "error") p.reject(new Error(msg.message));
                    else p.resolve(msg);
                }
            };
            worker.onerror = () => {
                worker = null;
                status.textContent = "Worker unavailable, solving on the main thread.";
                mainThreadReady();
            };
            worker.postMessage({type: "init"});
            status.textContent = "Building the solver's tables in the background...";
        }catch(err){
            worker = null;
            mainThreadReady();
        }
    }
    function mainThreadReady(){
        if(!fallback.solver){
            const t = Date.now();
            fallback.solver = new Solver();
            status.textContent = `Solver ready on the main thread (tables built in ${((Date.now() - t) / 1000).toFixed(1)} s).`;
        }
        ready = true;
        document.dispatchEvent(new Event("solver-ready"));
    }
    return {
        start: startWorker,
        isReady: () => ready,
        solve(facelets, maxLength, stopLength, timeMs){
            if(worker){
                return new Promise((resolve, reject) => {
                    const id = nextId++;
                    pending.set(id, {resolve, reject});
                    worker.postMessage({type: "solve", id, facelets, maxLength, stopLength, timeMs});
                });
            }
            mainThreadReady();
            const t = Date.now();
            const moves = fallback.solver.solve(facelets, maxLength, stopLength, timeMs);
            return Promise.resolve({moves, ms: Date.now() - t});
        }
    };
})();

//---- photos ----------------------------------------------------------------

const PHOTO_HINTS = [
    "Hold the cube so one corner points at the camera: the face you want to call the top, and the two faces below it.",
    "Flip the cube to the corner diagonally opposite and photograph its three faces. Any way round is fine."
];

//source is "sample", "camera" or "library". A photo taken on the live guide
//brings its own keypoints; any other photo gets the automatic guess.
function setPhoto(index, image, source, keypoints = null){
    const photo = {
        image, keypoints: keypoints || autoDetectKeypoints(image), canvas: $(`photo-canvas-${index}`),
        samples: null, sample: source === "sample", source
    };
    state.photos[index] = photo;
    $(`photo-card-${index}`).classList.add("has-photo");
    $(`photo-badge-${index}`).textContent = {sample: "synthetic sample", camera: "from your camera", library: "from your library"}[source];
    drawPhoto(index);
    rebuildFromPhotos();
}

//Draws the photo, the three face outlines and the seven draggable points.
function drawPhoto(index){
    const photo = state.photos[index];
    if(!photo) return;
    const {image, canvas} = photo;
    if(canvas.width !== image.width || canvas.height !== image.height){
        canvas.width = image.width;
        canvas.height = image.height;
    }
    const ctx = canvas.getContext("2d");
    const imageData = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    ctx.putImageData(imageData, 0, 0);
    const kp = normalizeRing(photo.keypoints);
    const quads = faceQuads(kp);
    const order = topFaceOrder(kp);
    const scale = Math.max(1, image.width / 360);
    ctx.lineWidth = 2 * scale;
    ctx.lineJoin = "round";
    //Face outlines.
    quads.forEach(q => {
        ctx.beginPath();
        ctx.moveTo(q[0][0], q[0][1]);
        for(let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
        ctx.closePath();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.stroke();
    });
    //Sampled sticker colours, as small discs where the stickers are read.
    if(photo.samples){
        photo.samples.faces.forEach(face => {
            if(!face.H) return;
            face.stickers.forEach(st => {
                const [x, y] = applyHomography(face.H, st.qcol + 0.5, st.qrow + 0.5);
                ctx.beginPath();
                ctx.arc(x, y, 5 * scale, 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${st.rgb.join(",")})`;
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.6)";
                ctx.lineWidth = 1 * scale;
                ctx.stroke();
            });
        });
        ctx.lineWidth = 2 * scale;
    }
    //Face names, once the cube has been reconstructed.
    const naming = photo.naming;
    if(naming){
        ctx.font = `bold ${16 * scale}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        order.forEach((quadIndex, k) => {
            const q = quads[quadIndex];
            const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
            //Put the label at the far corner side so it does not hide the centre sticker.
            const lx = cx + (q[2][0] - cx) * 0.55, ly = cy + (q[2][1] - cy) * 0.55;
            ctx.fillStyle = "rgba(0,0,0,0.65)";
            ctx.beginPath();
            ctx.arc(lx, ly, 12 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.fillText(FACE_NAMES[naming[k]], lx, ly);
        });
    }
    //Keypoints: the near corner is a ring, the six outer corners are dots.
    const drawPoint = (p, kind) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], (kind === "centre" ? 9 : 7) * scale, 0, Math.PI * 2);
        ctx.fillStyle = kind === "centre" ? "rgba(255,255,255,0.95)" : (kind === "edge" ? "#ff3d8f" : "#ffd23f");
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 2 * scale;
        ctx.stroke();
        if(kind === "centre"){
            ctx.beginPath();
            ctx.arc(p[0], p[1], 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = "#000";
            ctx.fill();
        }
    };
    kp.ring.forEach((p, i) => drawPoint(p, i % 2 === 0 ? "edge" : "far"));
    drawPoint(kp.centre, "centre");
    updatePhotoStatus(index);
}

//Dragging the keypoints with the pointer.
function installDragging(index){
    const canvas = $(`photo-canvas-${index}`);
    let dragging = null;
    const toImage = e => {
        const r = canvas.getBoundingClientRect();
        return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
    };
    canvas.addEventListener("pointerdown", e => {
        const photo = state.photos[index];
        if(!photo) return;
        const p = toImage(e);
        const kp = photo.keypoints;
        const candidates = [{key: "centre", pt: kp.centre}].concat(kp.ring.map((pt, i) => ({key: i, pt})));
        let best = null;
        for(const c of candidates){
            const d = Math.hypot(c.pt[0] - p[0], c.pt[1] - p[1]);
            if(d < 30 * canvas.width / canvas.getBoundingClientRect().width && (!best || d < best.d)) best = {...c, d};
        }
        if(best){
            dragging = best.key;
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
        }
    });
    canvas.addEventListener("pointermove", e => {
        if(dragging === null) return;
        const photo = state.photos[index];
        const p = toImage(e);
        const clamp = [Math.max(0, Math.min(canvas.width - 1, p[0])), Math.max(0, Math.min(canvas.height - 1, p[1]))];
        if(dragging === "centre") photo.keypoints.centre = clamp;
        else photo.keypoints.ring[dragging] = clamp;
        drawPhoto(index);
    });
    const finish = () => {
        if(dragging === null) return;
        dragging = null;
        rebuildFromPhotos();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
}

//Loads a photo file into an RGBA buffer, scaled down to a sensible size.
function loadPhotoFile(index, file){
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        const maxSide = 560;
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
        const off = document.createElement("canvas");
        off.width = w; off.height = h;
        const ctx = off.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        URL.revokeObjectURL(url);
        setPhoto(index, {width: w, height: h, data: data.data}, "library");
    };
    img.onerror = () => { URL.revokeObjectURL(url); setMessage("That file could not be read as an image.", "bad"); };
    img.src = url;
}

//Two synthetic photos of a random scramble, so the flow can be tried
//without a cube. The automatic keypoint guess fails on roughly one render
//in ten, so a few seeds are tried until the photos read as a valid cube;
//real photos get no such second chance, which is what the net is for.
function useSamplePhotos(seed){
    let chosen = null;
    for(let attempt = 0; attempt < 8 && !chosen; attempt++){
        const rng = new Random(seed + attempt * 7919);
        const cube = CubieCube.random(rng);
        const facelets = cube.toFacelets();
        const p1 = renderCornerPhoto(facelets, [1, 1, 1], rng, {width: 420, height: 420, spread: 0.25, roll: (rng.next() % 1000) / 1000 - 0.5});
        const p2 = renderCornerPhoto(facelets, [-1, -1, -1], rng, {width: 420, height: 420, spread: 0.25});
        const k1 = autoDetectKeypoints(p1.image), k2 = autoDetectKeypoints(p2.image);
        let ok = false;
        try{
            const result = reconstruct(sampleFaces(p1.image, k1), sampleFaces(p2.image, k2));
            ok = result.valid && !result.swapped;
        }catch(err){ ok = false; }
        if(ok || attempt === 7) chosen = {p1, p2};
    }
    setPhoto(0, chosen.p1.image, "sample");
    setPhoto(1, chosen.p2.image, "sample");
}

//---- live camera -----------------------------------------------------------
//
//"Take photo" opens the device camera in the photo frame with a guide drawn
//over it: the hexagon outline of a cube seen from a corner, the three edges
//meeting at the near corner, the sticker grid and the seven points. The
//preview is centre-cropped to the square frame and the captured photo is the
//same square, so the guide positions are the keypoints of the photo. While
//the preview runs, the stickers under the guide are sampled a few times a
//second and shown as colour discs.

const cameraSessions = [null, null];
const LIVE_SAMPLE_SIZE = 240;//pixels of the square frame used for live sampling
const PILL_DEFAULT = ["Point one corner at the camera", "Flip to the diagonally opposite corner"];

function setPill(index, text, kind){
    const pill = $(`photo-status-${index}`);
    pill.textContent = text;
    pill.className = "frame-pill" + (kind ? " " + kind : "");
}

function cameraSupported(){
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}

async function startCamera(index, facing){
    const card = $(`photo-card-${index}`);
    const fallback = $(`photo-camera-${index}`);
    if(!cameraSupported()){
        //No in-page camera here (plain http, or a sandboxed page): the
        //browser's own picker still offers the camera on phones.
        fallback.click();
        return;
    }
    stopCamera(index, false);
    const session = {stream: null, video: $(`photo-video-${index}`), facing: facing || "environment", samples: null, lastSample: 0, raf: 0};
    cameraSessions[index] = session;
    card.classList.add("capturing");
    setPill(index, "Starting the camera...", "");
    try{
        session.stream = await navigator.mediaDevices.getUserMedia({
            video: {facingMode: {ideal: session.facing}, width: {ideal: 1280}, height: {ideal: 1280}},
            audio: false
        });
    }catch(err){
        if(cameraSessions[index] === session) cameraSessions[index] = null;
        card.classList.remove("capturing");
        if(state.photos[index]) drawPhoto(index);
        else setPill(index, "Camera unavailable: choose a photo from your library instead", "warn");
        fallback.click();
        return;
    }
    if(cameraSessions[index] !== session){
        //Cancelled while the permission prompt was open.
        session.stream.getTracks().forEach(t => t.stop());
        return;
    }
    session.video.srcObject = session.stream;
    try{ await session.video.play(); }catch(err){ /* autoplay policies; the stream still renders */ }
    setPill(index, "Match the outline, then press the shutter", "");
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const cameras = devices.filter(d => d.kind === "videoinput").length;
        $(`photo-switch-${index}`).hidden = cameras < 2;
        $(`photo-spacer-${index}`).hidden = cameras >= 2;
    }).catch(() => {});
    liveLoop(index);
}

//Stops the preview. With restore, the frame goes back to the photo it had.
function stopCamera(index, restore = true){
    const session = cameraSessions[index];
    cameraSessions[index] = null;
    if(session){
        if(session.raf) cancelAnimationFrame(session.raf);
        if(session.stream) session.stream.getTracks().forEach(t => t.stop());
        session.video.srcObject = null;
    }
    $(`photo-card-${index}`).classList.remove("capturing");
    const guide = $(`photo-guide-${index}`);
    guide.getContext("2d").clearRect(0, 0, guide.width, guide.height);
    if(restore){
        if(state.photos[index]) drawPhoto(index);
        else setPill(index, PILL_DEFAULT[index], "");
    }
}

function switchCamera(index){
    const session = cameraSessions[index];
    if(!session) return;
    startCamera(index, session.facing === "environment" ? "user" : "environment");
}

//The centre square of the video, scaled to outSize pixels.
function grabSquare(video, outSize){
    const vw = video.videoWidth, vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const off = document.createElement("canvas");
    off.width = outSize;
    off.height = outSize;
    const ctx = off.getContext("2d");
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, outSize, outSize);
    const data = ctx.getImageData(0, 0, outSize, outSize);
    return {width: outSize, height: outSize, data: data.data};
}

function capturePhoto(index){
    const session = cameraSessions[index];
    if(!session || !session.video.videoWidth || session.video.readyState < 2) return;
    const side = Math.min(session.video.videoWidth, session.video.videoHeight);
    const image = grabSquare(session.video, Math.min(640, side));
    stopCamera(index, false);
    setPhoto(index, image, "camera", guideKeypoints(image.width));
}

function liveLoop(index){
    const session = cameraSessions[index];
    if(!session) return;
    const now = performance.now();
    if(now - session.lastSample > 250 && session.video.videoWidth && session.video.readyState >= 2){
        session.lastSample = now;
        try{
            session.samples = sampleFaces(grabSquare(session.video, LIVE_SAMPLE_SIZE), guideKeypoints(LIVE_SAMPLE_SIZE));
        }catch(err){
            session.samples = null;
        }
    }
    drawGuide(index, session.samples);
    session.raf = requestAnimationFrame(() => liveLoop(index));
}

//Draws the guide over the live preview, plus the live sticker colours.
function drawGuide(index, samples){
    const canvas = $(`photo-guide-${index}`);
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || cssW;
    if(canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)){
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, size = Math.min(w, h);
    const kp = guideKeypoints(size, w / 2, h / 2);
    const quads = faceQuads(kp);
    ctx.clearRect(0, 0, w, h);
    //Dim everything outside the cube outline.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    kp.ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    //Sticker grid of each face, thin.
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.setLineDash([]);
    for(const quad of quads){
        const H = homography(QUAD_GRID, quad);
        for(const t of [1, 2]){
            const a = applyHomography(H, t, 0), b = applyHomography(H, t, 3);
            const c = applyHomography(H, 0, t), d = applyHomography(H, 3, t);
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
        }
    }
    //Face outlines: the hexagon and the three edges meeting at the near corner.
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.setLineDash([8 * dpr, 6 * dpr]);
    for(const quad of quads){
        ctx.beginPath();
        quad.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath();
        ctx.stroke();
    }
    ctx.setLineDash([]);
    //Live sticker colours, read from the small sampling frame.
    if(samples){
        const scale = size / LIVE_SAMPLE_SIZE, ox = (w - size) / 2, oy = (h - size) / 2;
        for(const face of samples.faces){
            for(const st of face.stickers){
                const [x, y] = applyHomography(face.H, st.qcol + 0.5, st.qrow + 0.5);
                ctx.beginPath();
                ctx.arc(ox + x * scale, oy + y * scale, 6 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${st.rgb.join(",")})`;
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.6)";
                ctx.lineWidth = 1 * dpr;
                ctx.stroke();
            }
        }
    }
    //The seven points.
    const dot = (p, fill, r) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
    };
    kp.ring.forEach((p, i) => dot(p, i % 2 === 0 ? "#ff3d8f" : "#ffd23f", 7 * dpr));
    dot(kp.centre, "#fff", 9 * dpr);
    ctx.beginPath();
    ctx.arc(kp.centre[0], kp.centre[1], 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
}

//---- progress stepper and photo status -------------------------------------

//The sticky stepper shows what each step is waiting for.
function updateStepper(){
    const photos = state.photos.filter(Boolean).length;
    $("ai-button").disabled = photos < 2;
    const valid = state.facelets ? CubieCube.fromFacelets(state.facelets).verify() === "" : false;
    const solved = Boolean(state.solution);
    setStep(1, photos === 2 ? "done" : "current", photos === 2 ? "2 of 2 read" : `${photos} of 2`);
    setStep(2, photos < 2 ? "" : (valid ? "done" : "current"), photos < 2 ? "Waiting for photos" : (valid ? "Valid cube" : "Fix the stickers"));
    setStep(3, solved ? "done" : (valid ? "current" : ""), solved ? `${state.solution.length} moves` : (valid ? "Ready to solve" : "Needs a valid cube"));
}

function setStep(n, cls, text){
    $(`stepper-${n}`).className = cls;
    $(`stepper-state-${n}`).textContent = text;
}

//Pill over the photo: how wide the cube sits in the frame, from the hexagon
//the seven points describe. Between a third and nine tenths of the width
//reads well; smaller and the stickers are only a few pixels each.
function updatePhotoStatus(index){
    const photo = state.photos[index];
    if(!photo) return;
    const pill = $(`photo-status-${index}`);
    const kp = normalizeRing(photo.keypoints);
    const xs = kp.ring.map(p => p[0]), ys = kp.ring.map(p => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const fraction = span / Math.max(photo.image.width, photo.image.height);
    const pct = Math.round(fraction * 100);
    if(fraction < 0.33){
        pill.textContent = `Cube spans ${pct}% of the frame: move closer`;
        pill.className = "frame-pill warn";
    }else if(fraction > 0.92){
        pill.textContent = `Cube spans ${pct}% of the frame: step back so every corner shows`;
        pill.className = "frame-pill warn";
    }else{
        pill.textContent = `Cube spans ${pct}% of the frame` + (photo.samples ? " \u00b7 27 stickers read" : "");
        pill.className = "frame-pill good";
    }
}

//---- reconstruction and the net --------------------------------------------

function rebuildFromPhotos(){
    const [a, b] = state.photos;
    if(!a || !b){
        setMessage(a || b ? "Add the second photo to read the cube." : "Add two photos, or use the sample photos.", "info");
        updateStepper();
        return;
    }
    try{
        a.samples = sampleFaces(a.image, a.keypoints);
        b.samples = sampleFaces(b.image, b.keypoints);
    }catch(err){
        setMessage("The points of a photo overlap. Drag them onto the cube's corners.", "bad");
        return;
    }
    applyReconstruction(reconstruct(a.samples, b.samples), "");
}

//Shows a reconstruction (local or AI) in the net, the photos and the 3D cube.
function applyReconstruction(result, prefix){
    const [a, b] = state.photos;
    a.naming = PHOTO1_FACES;
    b.naming = result.photo2Faces;
    state.facelets = result.facelets;
    state.classRgb = {};
    const classFace = [...PHOTO1_FACES, ...result.photo2Faces];
    result.classRgb.forEach((rgb, cls) => { state.classRgb[FACE_NAMES[classFace[cls]]] = rgb; });
    drawPhoto(0);
    drawPhoto(1);
    renderNet();
    renderPalette();
    setMessage(prefix + result.message, result.valid ? (result.swapped ? "warn" : "good") : "bad");
    if(result.swapped){
        highlightSwapped(result);
    }
    clearSolution();
    cubeView.setPalette(currentPalette());
    cubeView.setFacelets(state.facelets);
    updateStepper();
}

//---- reading with a vision model -------------------------------------------

//JPEG of a photo, downscaled, as base64 without the data URL prefix.
function photoToJpeg(image, maxSide = 800){
    const s = Math.min(1, maxSide / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * s)), h = Math.max(1, Math.round(image.height * s));
    const src = document.createElement("canvas");
    src.width = image.width; src.height = image.height;
    src.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(src, 0, 0, w, h);
    return {data: out.toDataURL("image/jpeg", 0.85).split(",")[1], mediaType: "image/jpeg"};
}

async function readWithAi(){
    const [a, b] = state.photos;
    if(!a || !b) return;
    const button = $("ai-button");
    button.disabled = true;
    setMessage("Reading the stickers with AI, this takes a few seconds...", "info");
    try{
        const response = await fetch("api/read-cube", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({photos: [photoToJpeg(a.image), photoToJpeg(b.image)]})
        });
        let reply = null;
        try{ reply = await response.json(); }catch(err){ reply = null; }
        if(!response.ok || !reply || !Array.isArray(reply.photos)){
            const why = reply && reply.error ? reply.error : `the server answered ${response.status}`;
            throw new Error(why);
        }
        const samples = [];
        for(let p = 0; p < 2; p++){
            const reading = reply.photos[p];
            const problem = validatePhotoReading(reading);
            if(problem) throw new Error("the reply was incomplete (" + problem + ")");
            const photo = state.photos[p];
            if(reading.corners){
                try{ photo.keypoints = keypointsFromCorners(reading.corners, photo.image); }catch(err){ /* keep the current points */ }
            }
            photo.samples = samplesFromReading(reading, photo.keypoints);
            samples.push(photo.samples);
        }
        applyReconstruction(reconstruct(samples[0], samples[1]), "Read with AI: ");
    }catch(err){
        const text = String(err && err.message || err);
        const offline = /fetch|NetworkError|Failed to fetch|answered 404/.test(text);
        setMessage(offline ? "Read with AI needs the hosted site (the page could not reach its server)." : "Read with AI failed: " + text, "bad");
    }finally{
        button.disabled = !(state.photos[0] && state.photos[1]);
    }
}

function highlightSwapped(result){
    const [i, j] = result.swapped;
    for(const s of [i, j]){
        const p = Math.floor(s / 27), k = Math.floor((s % 27) / 9), q = s % 9;
        const idx = sampleFaceletIndex(p, k, q, result.photo2Faces);
        const cell = document.querySelector(`.net .sticker[data-index="${idx}"]`);
        if(cell) cell.classList.add("swapped");
    }
}

function currentPalette(){
    const palette = {};
    for(const f of FACE_NAMES) palette[f] = (state.classRgb && state.classRgb[f]) || STICKER_RGB[f];
    return palette;
}

function cssColour(face){
    const rgb = currentPalette()[face];
    return `rgb(${rgb.map(Math.round).join(",")})`;
}

//The unfolded cube: U on top, then L F R B in a row, D below.
const NET_LAYOUT = {U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2]};

function renderNet(){
    const net = $("net");
    net.innerHTML = "";
    const facelets = state.facelets || Facelets.SOLVED;
    for(const face of FACE_NAMES){
        const [gx, gy] = NET_LAYOUT[face];
        const faceEl = document.createElement("div");
        faceEl.className = "net-face";
        faceEl.style.gridColumn = String(gx + 1);
        faceEl.style.gridRow = String(gy + 1);
        const f = FACE_NAMES.indexOf(face);
        for(let i = 0; i < 9; i++){
            const idx = f * 9 + i;
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "sticker" + (i === 4 ? " centre" : "");
            cell.dataset.index = String(idx);
            cell.style.background = cssColour(facelets[idx]);
            cell.title = i === 4 ? `${face} centre` : `${face}${i + 1}: ${facelets[idx]}`;
            cell.setAttribute("aria-label", cell.title);
            if(i === 4){
                cell.textContent = face;
                cell.disabled = true;
            }else{
                cell.addEventListener("click", () => paintSticker(idx));
            }
            faceEl.appendChild(cell);
        }
        net.appendChild(faceEl);
    }
}

function renderPalette(){
    const pal = $("palette");
    pal.innerHTML = "";
    FACE_NAMES.split("").forEach((face, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "swatch" + (i === state.selectedColour ? " selected" : "");
        b.style.background = cssColour(face);
        b.textContent = face;
        b.title = `Paint stickers with the ${face} colour`;
        b.addEventListener("click", () => { state.selectedColour = i; renderPalette(); });
        pal.appendChild(b);
    });
}

function paintSticker(idx){
    if(!state.facelets) state.facelets = Facelets.SOLVED;
    const f = state.facelets.split("");
    f[idx] = FACE_NAMES[state.selectedColour];
    state.facelets = f.join("");
    renderNet();
    const problem = CubieCube.fromFacelets(state.facelets).verify();
    setMessage(problem === "" ? "Valid cube." : "Not a valid cube yet: " + problem + ".", problem === "" ? "good" : "bad");
    clearSolution();
    cubeView.setFacelets(state.facelets);
    updateStepper();
}

function setMessage(text, kind){
    const el = $("net-message");
    el.textContent = text;
    el.className = "message " + kind;
}

//---- solving and playback --------------------------------------------------

const cubeView = new CubeView($("cube-canvas"));
const player = {index: 0, playing: false, speed: 1};

function clearSolution(){
    state.solution = null;
    state.solveStart = null;
    player.index = 0;
    player.playing = false;
    $("solution").hidden = true;
    $("solve-button").disabled = false;
}

async function solve(){
    if(!state.facelets) return;
    const problem = CubieCube.fromFacelets(state.facelets).verify();
    if(problem !== ""){
        setMessage("Not a valid cube yet: " + problem + ". Fix the stickers first.", "bad");
        return;
    }
    if(CubieCube.fromFacelets(state.facelets).isSolved()){
        setMessage("This cube is already solved.", "good");
        return;
    }
    $("solve-button").disabled = true;
    $("solver-status").textContent = solverLink.isReady() ? "Searching..." : "Building tables, then searching...";
    const t = Date.now();
    try{
        //Stop at 19 moves or after 1.5 seconds of improving, whichever first.
        const result = await solverLink.solve(state.facelets, 24, 19, 1500);
        const moves = Moves.parseSequence(result.moves);
        state.solution = moves;
        state.solveStart = state.facelets;
        player.index = 0;
        $("solver-status").textContent = `Found ${moves.length} moves in ${((Date.now() - t) / 1000).toFixed(2)} s.`;
        showSolution();
    }catch(err){
        $("solver-status").textContent = "The solver failed: " + err.message;
        $("solve-button").disabled = false;
    }
}

function showSolution(){
    $("solution").hidden = false;
    updateStepper();
    $("move-count").textContent = String(state.solution.length);
    renderMoveStrip();
    cubeView.setFacelets(state.solveStart);
    $("solution").scrollIntoView({behavior: "smooth", block: "nearest"});
}

function renderMoveStrip(){
    const strip = $("moves");
    strip.innerHTML = "";
    state.solution.forEach((m, i) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "move" + (i < player.index ? " done" : "") + (i === player.index ? " next" : "");
        chip.textContent = Moves.name(m);
        chip.title = `Jump to before move ${i + 1}`;
        chip.addEventListener("click", () => jumpTo(i));
        strip.appendChild(chip);
    });
    const n = state.solution.length;
    const segments = $("segments");
    segments.innerHTML = "";
    for(let i = 0; i < n; i++){
        const s = document.createElement("i");
        if(i < player.index) s.className = "done";
        else if(i === player.index) s.className = "current";
        segments.appendChild(s);
    }
    $("move-index").textContent = String(Math.min(player.index + 1, n));
    $("progress").textContent = player.index >= n ? "all done" : `${player.index} done`;
    if(player.index < n){
        const m = state.solution[player.index];
        $("current-move").textContent = Moves.name(m);
        $("current-move-desc").textContent = describeMove(m);
    }else{
        $("current-move").textContent = "Solved";
        $("current-move-desc").textContent = "Every move has been played. Start over to watch it again.";
    }
    $("play-button").textContent = player.playing ? "Pause" : "Auto-play";
    $("step-forward").disabled = player.index >= n;
    $("step-back").disabled = player.index <= 0;
}

//"R'" -> "Right face, anticlockwise". Directions are as seen looking at that face.
const FACE_WORDS = {U: "Top face", R: "Right face", F: "Front face", D: "Bottom face", L: "Left face", B: "Back face"};
function describeMove(move){
    const face = FACE_NAMES[Math.floor(move / 3)];
    const turn = ["clockwise, a quarter turn", "a half turn", "anticlockwise, a quarter turn"][move % 3];
    return `${FACE_WORDS[face]} (${face}), ${turn}`;
}

function faceletsAfter(count){
    let f = state.solveStart;
    for(let i = 0; i < count; i++) f = Facelets.applyMove(f, state.solution[i]);
    return f;
}

function jumpTo(i){
    player.playing = false;
    player.index = Math.max(0, Math.min(state.solution.length, i));
    cubeView.turn = null;
    cubeView.setFacelets(faceletsAfter(player.index));
    renderMoveStrip();
}

async function stepForward(){
    if(cubeView.turn || !state.solution || player.index >= state.solution.length) return;
    const m = state.solution[player.index];
    player.index++;
    renderMoveStrip();
    await cubeView.animateMove(m, 500 / player.speed);
}

async function stepBack(){
    if(cubeView.turn || !state.solution || player.index <= 0) return;
    player.index--;
    renderMoveStrip();
    await cubeView.animateMove(Moves.inverse(state.solution[player.index]), 500 / player.speed);
}

async function play(){
    if(!state.solution) return;
    if(player.playing){ player.playing = false; renderMoveStrip(); return; }
    if(player.index >= state.solution.length) jumpTo(0);
    player.playing = true;
    renderMoveStrip();
    //state.solution becomes null if a new cube is loaded mid-playback.
    while(player.playing && state.solution && player.index < state.solution.length){
        await stepForward();
        if(state.solution && player.index < state.solution.length) await new Promise(r => setTimeout(r, 120 / player.speed));
    }
    player.playing = false;
    if(state.solution) renderMoveStrip();
}

//---- wiring ----------------------------------------------------------------

function init(){
    for(const i of [0, 1]){
        $(`photo-hint-${i}`).textContent = PHOTO_HINTS[i];
        installDragging(i);
        for(const id of [`photo-file-${i}`, `photo-camera-${i}`]){
            $(id).addEventListener("change", e => {
                const file = e.target.files && e.target.files[0];
                if(file) loadPhotoFile(i, file);
                e.target.value = "";
            });
        }
        $(`photo-take-${i}`).addEventListener("click", () => startCamera(i));
        $(`photo-capture-${i}`).addEventListener("click", () => capturePhoto(i));
        $(`photo-cancel-${i}`).addEventListener("click", () => stopCamera(i));
        $(`photo-switch-${i}`).addEventListener("click", () => switchCamera(i));
        $(`photo-reset-${i}`).addEventListener("click", () => {
            const photo = state.photos[i];
            if(!photo) return;
            photo.keypoints = autoDetectKeypoints(photo.image);
            drawPhoto(i);
            rebuildFromPhotos();
        });
        $(`photo-default-${i}`).addEventListener("click", () => {
            const photo = state.photos[i];
            if(!photo) return;
            photo.keypoints = defaultKeypoints(photo.image.width, photo.image.height);
            drawPhoto(i);
            rebuildFromPhotos();
        });
    }
    $("sample-button").addEventListener("click", () => useSamplePhotos((Date.now() % 100000) + 1));
    $("reread-button").addEventListener("click", rebuildFromPhotos);
    $("ai-button").addEventListener("click", readWithAi);
    $("solve-button").addEventListener("click", solve);
    $("play-button").addEventListener("click", play);
    $("step-back").addEventListener("click", stepBack);
    $("step-forward").addEventListener("click", stepForward);
    $("reset-button").addEventListener("click", () => jumpTo(0));
    $("speed").addEventListener("input", e => { player.speed = Number(e.target.value); $("speed-label").textContent = `${player.speed.toFixed(1)}x`; });
    window.addEventListener("pagehide", () => { stopCamera(0, false); stopCamera(1, false); });
    renderNet();
    renderPalette();
    solverLink.start();
    //Open with a worked example so the page shows what it does.
    useSamplePhotos(20261001);
    document.addEventListener("solver-ready", () => {
        if(!state.solution && state.photos[0] && state.photos[0].sample) solve();
    }, {once: true});
}

init();
