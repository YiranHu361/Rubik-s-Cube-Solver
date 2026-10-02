//End-to-end tests of the photo pipeline: a random cube is rendered into two
//synthetic corner photos with a random camera, lighting and flip, and the
//pipeline has to recover the exact facelet string. Run with "npm test".
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

import {CubieCube, Random, Facelets, Moves, solveVectors, Solver} from "../solver.js";
import {homography, applyHomography, faceGridCorners, quadCellToFaceCell, QUAD_GRID, normalizeRing, cameraFromDirection} from "../geometry.js";
import {renderCornerPhoto, STICKER_RGB, cubePolygons, turningLayer, guideAlignedCamera} from "../render.js";
import {sampleFaces, reconstruct, autoDetectKeypoints, hungarian, groupColours, rgbToLab, PHOTO2_CANDIDATES, guideKeypoints, defaultKeypoints} from "../vision.js";
import {projectKeypoints} from "../geometry.js";
import {samplesFromReading, validatePhotoReading, readingFromFacelets, keypointsFromCorners} from "../aiRead.js";

const here = dirname(fileURLToPath(import.meta.url));
const URF = [1, 1, 1], DBL = [-1, -1, -1];

//Takes the two photos of a cube with random cameras: the camera roll
//decides which face ends up at the top of each photo, which is how the
//photographer "flipped" the cube.
function photograph(facelets, rng, options = {}){
    const p1 = renderCornerPhoto(facelets, URF, rng, {spread: 0.3, ...options});
    const p2 = renderCornerPhoto(facelets, DBL, rng, {spread: 0.3, ...options});
    return {p1, p2};
}

//The pipeline names the top face of photo 1 "U", so when the camera was
//rolled the result is the same cube held differently. All 24 ways of holding
//a cube are reached by combining x, y and z turns of the facelet string.
function sameCubeUpToRotation(a, b){
    const seen = new Set();
    const queue = [a];
    while(queue.length){
        const f = queue.pop();
        if(seen.has(f)) continue;
        seen.add(f);
        if(Facelets.relabelByCentres(f) === b) return true;
        for(const axis of "xyz") queue.push(Facelets.rotate(f, axis));
    }
    assert.equal(seen.size, 24);
    return false;
}

test("homography maps its four corners exactly", () => {
    const src = [[0, 0], [3, 0], [3, 3], [0, 3]];
    const dst = [[10, 12], [95, 30], [120, 140], [5, 100]];
    const H = homography(src, dst);
    for(let i = 0; i < 4; i++){
        const [x, y] = applyHomography(H, ...src[i]);
        assert.ok(Math.abs(x - dst[i][0]) < 1e-6 && Math.abs(y - dst[i][1]) < 1e-6);
    }
});

test("face grid corners follow the facelet convention for the URF photo", () => {
    //U face: vertex = U9 (row 2, col 2) -> (3,3); shared with F = UFL = U7 -> (0,3);
    //far = ULB = U1 -> (0,0); shared with R = UBR = U3 -> (3,0).
    assert.deepEqual(faceGridCorners([0, 1, 2], 0), [[3, 3], [0, 3], [0, 0], [3, 0]]);
    //R face: vertex R1 -> (0,0), shared with U = UBR = R3 -> (3,0), far DRB = R9 -> (3,3), shared with F = DFR = R7 -> (0,3).
    assert.deepEqual(faceGridCorners([0, 1, 2], 1), [[0, 0], [3, 0], [3, 3], [0, 3]]);
    //Every photo-relative cell maps onto a distinct face cell, centre to centre.
    for(const faces of [[0, 1, 2], ...PHOTO2_CANDIDATES]){
        for(let k = 0; k < 3; k++){
            const seen = new Set();
            for(let q = 0; q < 9; q++){
                const [row, col] = quadCellToFaceCell(faces, k, Math.floor(q / 3), q % 3);
                seen.add(row * 3 + col);
            }
            assert.equal(seen.size, 9);
            assert.deepEqual(quadCellToFaceCell(faces, k, 1, 1), [1, 1]);
        }
    }
});

test("hungarian finds the minimum assignment", () => {
    const cost = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
    assert.deepEqual(hungarian(cost), [1, 0, 2]);
});

test("balanced grouping gives every colour exactly nine stickers", () => {
    const rng = new Random(5);
    const letters = "URFDLB";
    const stickers = [];
    for(let i = 0; i < 54; i++){
        const base = STICKER_RGB[letters[Math.floor(i / 9)]];
        const rgb = base.map(c => Math.max(0, Math.min(255, c * (0.6 + 0.4 * (rng.next() % 100) / 100) + (rng.next() % 30) - 15)));
        stickers.push({lab: rgbToLab(...rgb)});
    }
    const centres = [4, 13, 22, 31, 40, 49];
    const {labels} = groupColours(stickers, centres);
    for(let cls = 0; cls < 6; cls++) assert.equal(labels.filter(l => l === cls).length, 9);
    centres.forEach((c, cls) => assert.equal(labels[c], cls));
});

test("exact keypoints: 40 random cubes, random camera, light and flip", () => {
    const rng = new Random(2024);
    for(let i = 0; i < 40; i++){
        const cube = CubieCube.random(rng);
        const facelets = cube.toFacelets();
        const {p1, p2} = photograph(facelets, rng);
        const result = reconstruct(sampleFaces(p1.image, p1.keypoints), sampleFaces(p2.image, p2.keypoints));
        assert.ok(sameCubeUpToRotation(facelets, result.facelets), `cube ${i}: ${result.message}`);
        assert.equal(result.swapped, null, `cube ${i} needed a repair`);
    }
});

test("every way of flipping the cube for photo 2 is recognised", () => {
    const rng = new Random(77);
    const cube = CubieCube.random(rng);
    const facelets = cube.toFacelets();
    const found = new Set();
    for(let step = 0; step < 12; step++){
        const roll = step * Math.PI / 6;
        const p1 = renderCornerPhoto(facelets, URF, rng, {roll: 0.2});
        const p2 = renderCornerPhoto(facelets, DBL, rng, {roll});
        const result = reconstruct(sampleFaces(p1.image, p1.keypoints), sampleFaces(p2.image, p2.keypoints));
        assert.ok(sameCubeUpToRotation(facelets, result.facelets), `roll ${step}: ${result.message}`);
        found.add(result.photo2Faces.join(""));
    }
    assert.equal(found.size, 3, "all three cyclic namings should occur across a full turn");
});

test("keypoints are found automatically on synthetic photos", () => {
    const rng = new Random(99);
    let recovered = 0;
    const total = 30;
    for(let i = 0; i < total; i++){
        const cube = CubieCube.random(rng);
        const facelets = cube.toFacelets();
        const {p1, p2} = photograph(facelets, rng, {spread: 0.25});
        const k1 = autoDetectKeypoints(p1.image), k2 = autoDetectKeypoints(p2.image);
        const result = reconstruct(sampleFaces(p1.image, k1), sampleFaces(p2.image, k2));
        if(sameCubeUpToRotation(facelets, result.facelets)) recovered++;
    }
    console.log(`  automatic keypoints recovered ${recovered}/${total} cubes`);
    assert.ok(recovered >= total * 0.9, `only ${recovered}/${total} recovered with automatic keypoints`);
});

test("a single misread sticker is repaired by swapping", () => {
    const rng = new Random(31);
    const cube = CubieCube.random(rng);
    const facelets = cube.toFacelets();
    const {p1, p2} = photograph(facelets, rng, {roll: 0});
    const s1 = sampleFaces(p1.image, p1.keypoints), s2 = sampleFaces(p2.image, p2.keypoints);
    const clean = reconstruct(s1, s2);
    assert.ok(sameCubeUpToRotation(facelets, clean.facelets));
    //Make two non-centre stickers of different colours look like each other's colour.
    const a = s1.faces[0].stickers[0], b = s1.faces[1].stickers[8];
    assert.notEqual(clean.labels[0], clean.labels[9 + 8], "pick a cube whose two test stickers differ");
    [a.rgb, b.rgb] = [b.rgb, a.rgb];
    [a.lab, b.lab] = [b.lab, a.lab];
    const result = reconstruct(s1, s2);
    assert.ok(result.valid);
    assert.deepEqual(result.swapped, [0, 17], "expected those two stickers to be swapped back");
    assert.equal(result.facelets, clean.facelets);
});

test("the 3D viewer draws every visible sticker, also mid-turn", () => {
    const camera = cameraFromDirection([1, 1, 1], 8, 0, 300, 400, 400);
    //From a corner, 27 stickers face the camera; mid-turn a few more show.
    const still = cubePolygons(Facelets.SOLVED, camera);
    const stickers = still.filter(p => p.rgb[0] > 100 || p.rgb[1] > 100 || p.rgb[2] > 100);
    assert.equal(stickers.length, 27);
    const turning = cubePolygons(Facelets.SOLVED, camera, turningLayer(3, 0.5));
    assert.ok(turning.length >= still.length - 10);
    assert.ok(turning.every(p => p.points.length === 4 && p.rgb.length === 3));
});

test("the capture guide has the right parity and matches an aligned camera", () => {
    const size = 480;
    const guide = guideKeypoints(size);
    assert.deepEqual(defaultKeypoints(size, size), guide);
    for(const [signs, roll] of [[URF, 0], [DBL, Math.PI]]){
        const projected = projectKeypoints(guideAlignedCamera(size, signs, roll), signs);
        assert.ok(Math.hypot(projected.centre[0] - size / 2, projected.centre[1] - size / 2) < 1);
        //Every projected outer vertex lands on a guide vertex of the same kind
        //(edge vertex or far vertex).
        for(let i = 0; i < 6; i++){
            const p = projected.ring[i];
            let best = -1, bestD = Infinity;
            guide.ring.forEach((g, j) => {
                const d = Math.hypot(g[0] - p[0], g[1] - p[1]);
                if(d < bestD){ bestD = d; best = j; }
            });
            assert.ok(bestD < 2, `vertex ${i} is ${bestD.toFixed(1)} px from the guide`);
            assert.equal(best % 2, i % 2, "the guide's edge vertices must be the cube's edge vertices");
        }
    }
});

test("photos taken on the guide reconstruct with the guide points, no detection", () => {
    const rng = new Random(4242);
    const size = 480;
    for(let i = 0; i < 10; i++){
        const facelets = CubieCube.random(rng).toFacelets();
        const p1 = renderCornerPhoto(facelets, URF, rng, {width: size, height: size, camera: guideAlignedCamera(size, URF, 0)});
        const p2 = renderCornerPhoto(facelets, DBL, rng, {width: size, height: size, camera: guideAlignedCamera(size, DBL, Math.PI)});
        const result = reconstruct(sampleFaces(p1.image, guideKeypoints(size)), sampleFaces(p2.image, guideKeypoints(size)));
        assert.ok(sameCubeUpToRotation(facelets, result.facelets), `cube ${i}: ${result.message}`);
        assert.equal(result.swapped, null);
    }
});

test("a vision-model reading of both photos reconstructs the cube", () => {
    const rng = new Random(99);
    for(let i = 0; i < 12; i++){
        const facelets = CubieCube.random(rng).toFacelets();
        //Any of the three ways the model may have seen photo 2 must work.
        const reading = readingFromFacelets(facelets, PHOTO2_CANDIDATES[i % 3]);
        assert.equal(validatePhotoReading(reading.photos[0]), "");
        const result = reconstruct(samplesFromReading(reading.photos[0]), samplesFromReading(reading.photos[1]));
        assert.ok(sameCubeUpToRotation(facelets, result.facelets), `cube ${i}: ${result.message}`);
        assert.equal(result.swapped, null);
    }
});

test("a reading with one wrong sticker is repaired, and miscounted colours are rebalanced", () => {
    const rng = new Random(123);
    const facelets = CubieCube.random(rng).toFacelets();
    const reading = readingFromFacelets(facelets);
    //Swap two different, non-centre stickers in photo 1 (grid[0][0] of faces 0 and 1).
    const g0 = reading.photos[0].faces[0].grid, g1 = reading.photos[0].faces[1].grid;
    if(g0[0][0] !== g1[0][0]){
        [g0[0][0], g1[0][0]] = [g1[0][0], g0[0][0]];
        const result = reconstruct(samplesFromReading(reading.photos[0]), samplesFromReading(reading.photos[1]));
        assert.ok(result.valid);
        assert.ok(result.swapped, "expected the two stickers to be swapped back");
        assert.ok(sameCubeUpToRotation(facelets, result.facelets));
    }
    //A sticker misnamed as another colour (ten of one colour, eight of another):
    //the balanced assignment moves exactly one sticker, and validity decides which.
    const clean = readingFromFacelets(facelets);
    const grid = clean.photos[1].faces[2].grid;
    const original = grid[0][2];
    grid[0][2] = original === "white" ? "yellow" : "white";
    const result = reconstruct(samplesFromReading(clean.photos[0]), samplesFromReading(clean.photos[1]));
    assert.ok(result.valid, result.message);
    assert.ok(sameCubeUpToRotation(facelets, result.facelets));
    assert.equal(validatePhotoReading({faces: [{grid: [["pink", "white", "white"], ["white"] , []]}]}), "expected three faces");
});

test("rough corner guesses from the model become usable keypoints", () => {
    const rng = new Random(2026);
    const unit = () => rng.next() / 4294967296;
    let recovered = 0;
    const total = 20;
    for(let i = 0; i < total; i++){
        const facelets = CubieCube.random(rng).toFacelets();
        const {p1, p2} = photograph(facelets, rng, {spread: 0.25});
        //Corners as the model reports them: fractions of the frame, a few
        //pixels off, one of them a lot off, in any clockwise starting point.
        const rough = photo => {
            const outer = photo.keypoints.ring.map(([x, y]) => [x / photo.image.width, y / photo.image.height]);
            const start = Math.floor(unit() * 6);
            const spun = outer.map((_, k) => outer[(k + start) % 6]);
            const noisy = spun.map(([x, y]) => [x + (unit() - 0.5) * 0.03, y + (unit() - 0.5) * 0.03]);
            const bad = Math.floor(unit() * 6);
            noisy[bad] = [noisy[bad][0] + 0.04, noisy[bad][1] - 0.03];
            const near = [photo.keypoints.centre[0] / photo.image.width + 0.03, photo.keypoints.centre[1] / photo.image.height - 0.02];
            return {near, outer: noisy};
        };
        const k1 = keypointsFromCorners(rough(p1), p1.image), k2 = keypointsFromCorners(rough(p2), p2.image);
        const result = reconstruct(sampleFaces(p1.image, k1), sampleFaces(p2.image, k2));
        if(sameCubeUpToRotation(facelets, result.facelets)) recovered++;
    }
    console.log(`  rough corners recovered ${recovered}/${total} cubes`);
    assert.ok(recovered >= total * 0.85, `only ${recovered}/${total} recovered from rough corners`);
});

test("the JavaScript solver matches the C++ solver move for move", () => {
    const bin = join(here, "..", "..", "bin", "cube3");
    if(!existsSync(bin)){
        console.log("  (bin/cube3 not built, skipping the cross-check)");
        return;
    }
    const expected = execFileSync(bin, ["vectors", "60", "--stop", "21"], {encoding: "utf8"}).trim().split("\n");
    const got = solveVectors(60, 21, 777);
    assert.deepEqual(got, expected);
});

test("solutions solve the cube", () => {
    const solver = new Solver();
    const rng = new Random(8);
    for(let i = 0; i < 20; i++){
        const cube = CubieCube.random(rng);
        const moves = Moves.parseSequence(solver.solve(cube));
        assert.ok(moves.length > 0 && moves.length <= 24);
        assert.ok(cube.clone().applyMoves(moves).isSolved());
    }
    assert.equal(solver.solve(Facelets.SOLVED), "");
});
