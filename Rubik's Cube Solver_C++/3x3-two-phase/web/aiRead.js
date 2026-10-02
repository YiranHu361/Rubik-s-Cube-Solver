//Reading the stickers with a vision language model.
//
//The page sends both photos to /api/read-cube (api/read-cube.js at the repo
//root, a Vercel function that calls Claude with a JSON schema). The reply
//gives, for each photo, the three visible faces clockwise from the topmost
//one, each as a 3x3 grid of colour names, plus a rough guess of the seven
//corners. This module turns that reading into the same "samples" that
//sampleFaces() produces, so reconstruct(), the validity checks, the repair
//and the net all stay exactly the same.
//
//Grid convention, shared with the prompt in api/read-cube.js: grid[0][0] is
//the sticker touching the near corner (where the three faces meet); the
//first index grows along the edge shared with the next face clockwise, the
//second along the edge shared with the previous face. That is the
//photo-relative grid of geometry.js (qrow, qcol).
import {faceQuads, normalizeRing, topFaceOrder, homography, QUAD_GRID} from "./geometry.js";
import {STICKER_RGB} from "./render.js";
import {hexagonToKeypoints, hexagonFromHull, silhouetteHull, snapToHull, sampleFaceletIndex, PHOTO2_CANDIDATES} from "./vision.js";
import {FACE_NAMES} from "./solver.js";

export const COLOUR_NAMES = ["white", "yellow", "red", "orange", "green", "blue"];
//Display colour per name, and a stand-in for the Lab colour: six points far
//apart, so the balanced grouping and the repair simply count how many
//stickers they have to move.
const NAME_RGB = {white: STICKER_RGB.U, yellow: STICKER_RGB.D, red: STICKER_RGB.R, orange: STICKER_RGB.L, green: STICKER_RGB.F, blue: STICKER_RGB.B};
const NAME_VECTOR = {white: [100, 0, 0], yellow: [0, 100, 0], red: [0, 0, 100], orange: [-100, 0, 0], green: [0, -100, 0], blue: [0, 0, -100]};
//Standard colour scheme, used when simulating a reading from a facelet string.
const LETTER_NAME = {U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue"};

//Checks one photo's reading. Returns "" when usable, else what is wrong.
export function validatePhotoReading(reading){
    if(!reading || !Array.isArray(reading.faces) || reading.faces.length !== 3) return "expected three faces";
    for(const face of reading.faces){
        if(!face || !Array.isArray(face.grid) || face.grid.length !== 3) return "each face needs a 3x3 grid";
        for(const row of face.grid){
            if(!Array.isArray(row) || row.length !== 3) return "each face needs a 3x3 grid";
            for(const name of row) if(!COLOUR_NAMES.includes(name)) return `unknown colour "${name}"`;
        }
    }
    const c = reading.corners;
    if(c !== undefined && c !== null){
        const point = p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && v >= 0 && v <= 1);
        if(!point(c.near) || !Array.isArray(c.outer) || c.outer.length !== 6 || !c.outer.every(point)) return "corners must be seven points with coordinates between 0 and 1";
    }
    return "";
}

//Keypoints in pixels from the model's rough corners, refined on the image:
//each outline corner snaps to the nearest corner of the cube's silhouette
//when one is close, then hexagonToKeypoints finds the near corner along the
//dark gap lines and works out which outline corners are joined to it.
export function keypointsFromCorners(corners, image){
    const rough = corners.outer.map(([x, y]) => [x * image.width, y * image.height]);
    const hull = silhouetteHull(image);
    const silhouetteCorners = hull ? hexagonFromHull(hull) : null;
    const hex = snapToHull(rough, silhouetteCorners, 0.06 * Math.max(image.width, image.height));
    const near = [corners.near[0] * image.width, corners.near[1] * image.height];
    return hexagonToKeypoints(hex, image, near);
}

//Builds what sampleFaces() returns from a reading. With keypoints, each
//face also gets the homography the page uses to draw the colour discs.
export function samplesFromReading(reading, keypoints = null){
    let quads = null, order = [0, 1, 2];
    if(keypoints){
        const kp = normalizeRing(keypoints);
        quads = faceQuads(kp);
        order = topFaceOrder(kp);
    }
    const faces = reading.faces.map((face, k) => {
        const quad = quads ? quads[order[k]] : null;
        const H = quad ? homography(QUAD_GRID, quad) : null;
        const stickers = [];
        for(let qrow = 0; qrow < 3; qrow++){
            for(let qcol = 0; qcol < 3; qcol++){
                const name = face.grid[qrow][qcol];
                stickers.push({rgb: NAME_RGB[name], lab: NAME_VECTOR[name], qrow, qcol, name});
            }
        }
        return {quad, H, stickers};
    });
    return {order, faces};
}

//What a perfect reading of a cube would look like, for tests and the
//browser check: photo 1 shows U, R, F clockwise from the top; photo 2 shows
//the other three faces in the given cyclic order.
export function readingFromFacelets(facelets, photo2Faces = PHOTO2_CANDIDATES[0]){
    const photos = [];
    for(let p = 0; p < 2; p++){
        const faces = [];
        for(let k = 0; k < 3; k++){
            const grid = [[], [], []];
            for(let q = 0; q < 9; q++){
                const idx = sampleFaceletIndex(p, k, q, photo2Faces);
                grid[Math.floor(q / 3)].push(LETTER_NAME[facelets[idx]]);
            }
            faces.push({position: ["top", "lower_right", "lower_left"][k], grid});
        }
        photos.push({faces, corners: null});
    }
    return {photos};
}

export {FACE_NAMES};
