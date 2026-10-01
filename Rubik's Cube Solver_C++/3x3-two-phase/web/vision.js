//From two corner photos to a facelet string.
//
//  1. autoDetectKeypoints: a first guess at the 7 keypoints of a photo
//     (the user can drag them afterwards).
//  2. sampleFaces: a homography per visible face maps its 3x3 grid onto the
//     photo, and the median colour of each sticker is read.
//  3. groupColours: the 54 stickers are assigned to the 6 centre colours so
//     that every colour gets exactly 9 stickers (minimum-cost assignment).
//  4. reconstruct: photo 1 fixes U, R and F; the three remaining colours are
//     tried in the three possible cyclic orders for D, B and L, and the
//     candidate that is a valid cube wins. If none is valid, the cheapest
//     swap of two stickers that makes one valid is applied.
import {faceQuads, normalizeRing, topFaceOrder, homography, applyHomography, QUAD_GRID, quadCellToFaceCell} from "./geometry.js";
import {convexHull} from "./render.js";
import {CubieCube, FACE_NAMES, Face} from "./solver.js";

//---- colour --------------------------------------------------------------

//sRGB (0..255) to CIE Lab, the usual way (D65 white).
export function rgbToLab(r, g, b){
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

//Distance between two Lab colours. Lightness counts less than hue because
//shading differs from face to face and photo to photo.
export function colourDistance(a, b){
    const dl = (a[0] - b[0]) * 0.45, da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
}

//Lab of a sticker colour with the shading taken out: a face in shadow is
//roughly the same colour multiplied by a constant, so scaling the brightest
//channel up to 255 makes a dark orange look like orange again instead of
//like red.
export function stickerLab(rgb){
    const m = Math.max(rgb[0], rgb[1], rgb[2], 1);
    const s = 255 / m;
    return rgbToLab(rgb[0] * s, rgb[1] * s, rgb[2] * s);
}

function pixelAt(image, x, y){
    const xi = Math.max(0, Math.min(image.width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(image.height - 1, Math.round(y)));
    const o = (yi * image.width + xi) * 4;
    return [image.data[o], image.data[o + 1], image.data[o + 2]];
}

function median(values){
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

//---- step 2: sampling ------------------------------------------------------

//Median colour of the middle of sticker (row, col) through homography H
//(grid units: the face is 3x3, the sticker centre is at (col+.5, row+.5)).
export function sampleSticker(image, H, row, col){
    const rs = [], gs = [], bs = [];
    for(let dy = -0.22; dy <= 0.221; dy += 0.11){
        for(let dx = -0.22; dx <= 0.221; dx += 0.11){
            const [x, y] = applyHomography(H, col + 0.5 + dx, row + 0.5 + dy);
            const [r, g, b] = pixelAt(image, x, y);
            rs.push(r); gs.push(g); bs.push(b);
        }
    }
    return [median(rs), median(gs), median(bs)];
}

//Reads the 27 stickers of one photo. Image faces are taken clockwise from
//the top one; within a face, stickers are read in the photo-relative grid
//(QUAD_GRID), because which cube face it is has not been decided yet.
//Returns {order, faces: [{quad, H, stickers: [{rgb, lab, qrow, qcol}] x 9}] x 3}.
export function sampleFaces(image, keypoints){
    const kp = normalizeRing(keypoints);
    const quads = faceQuads(kp);
    const order = topFaceOrder(kp);
    const result = [];
    for(let k = 0; k < 3; k++){
        const quad = quads[order[k]];
        const H = homography(QUAD_GRID, quad);
        const stickers = [];
        for(let qrow = 0; qrow < 3; qrow++){
            for(let qcol = 0; qcol < 3; qcol++){
                const rgb = sampleSticker(image, H, qrow, qcol);
                stickers.push({rgb, lab: stickerLab(rgb), qrow, qcol});
            }
        }
        result.push({quad, H, stickers});
    }
    return {order, faces: result};
}

//---- step 3: balanced grouping ---------------------------------------------

//Hungarian algorithm (Kuhn-Munkres) for a square cost matrix. Returns
//assignment[row] = column with the minimum total cost.
export function hungarian(cost){
    const n = cost.length;
    const INF = Number.MAX_VALUE;
    const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for(let i = 1; i <= n; i++){
        p[0] = i;
        let j0 = 0;
        const minv = new Array(n + 1).fill(INF);
        const used = new Array(n + 1).fill(false);
        do{
            used[j0] = true;
            const i0 = p[j0];
            let delta = INF, j1 = 0;
            for(let j = 1; j <= n; j++){
                if(used[j]) continue;
                const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if(cur < minv[j]){ minv[j] = cur; way[j] = j0; }
                if(minv[j] < delta){ delta = minv[j]; j1 = j; }
            }
            for(let j = 0; j <= n; j++){
                if(used[j]){ u[p[j]] += delta; v[j] -= delta; }
                else minv[j] -= delta;
            }
            j0 = j1;
        }while(p[j0] !== 0);
        do{
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        }while(j0);
    }
    const assignment = new Array(n);
    for(let j = 1; j <= n; j++) if(p[j] > 0) assignment[p[j] - 1] = j - 1;
    return assignment;
}

//stickers: array of {lab} (54 of them). centres: indices into that array of
//the six centre stickers, which define the six colour classes 0..5.
//Every class receives exactly 9 stickers, the centre always its own class.
//Returns {labels: class per sticker, cost: total distance, distances}.
export function groupColours(stickers, centres){
    const n = stickers.length;
    const perClass = n / centres.length;
    const distances = stickers.map(s => centres.map(c => colourDistance(s.lab, stickers[c].lab)));
    const cost = [];
    for(let i = 0; i < n; i++){
        const row = [];
        const centreClass = centres.indexOf(i);
        for(let j = 0; j < n; j++){
            const cls = Math.floor(j / perClass);
            if(centreClass >= 0) row.push(cls === centreClass ? 0 : 1e6);
            else row.push(distances[i][cls]);
        }
        cost.push(row);
    }
    const assignment = hungarian(cost);
    const labels = assignment.map(j => Math.floor(j / perClass));
    let total = 0;
    labels.forEach((cls, i) => { if(!centres.includes(i)) total += distances[i][cls]; });
    return {labels, cost: total, distances};
}

//---- step 4: facelet string ------------------------------------------------

const {U, R, F, D, L, B} = Face;
//Photo 1 shows U, R, F clockwise from the top. Photo 2 shows the three
//other faces; which of them is D, B or L depends on how the cube was
//flipped, so these three cyclic orders are the candidates.
export const PHOTO1_FACES = [U, R, F];
export const PHOTO2_CANDIDATES = [[D, B, L], [B, L, D], [L, D, B]];

//Positions of the 54 samples: photo p (0/1), image face k (0..2 clockwise
//from top), photo-relative cell q (qrow*3+qcol). Sample index = p*27 + k*9 + q.
//Returns the facelet index each sample lands on for a given face naming.
export function sampleFaceletIndex(p, k, q, photo2Faces){
    const faces = p === 0 ? PHOTO1_FACES : photo2Faces;
    const [row, col] = quadCellToFaceCell(faces, k, Math.floor(q / 3), q % 3);
    return faces[k] * 9 + row * 3 + col;
}

//Turns sample labels into a facelet string. labels[i] is a class 0..5
//(0..2 = centres of photo 1 faces, 3..5 = centres of photo 2 faces).
function faceletsFromLabels(labels, photo2Faces){
    const classFace = [...PHOTO1_FACES, ...photo2Faces];
    const facelets = new Array(54).fill("?");
    for(let i = 0; i < 54; i++){
        const p = Math.floor(i / 27), k = Math.floor((i % 27) / 9), s = i % 9;
        facelets[sampleFaceletIndex(p, k, s, photo2Faces)] = FACE_NAMES[classFace[labels[i]]];
    }
    return facelets.join("");
}

//photo1, photo2: results of sampleFaces. Returns
//{facelets, valid, message, photo2Faces, labels, swapped, classRgb}.
export function reconstruct(photo1, photo2){
    const stickers = [];
    for(const photo of [photo1, photo2]) for(const face of photo.faces) for(const st of face.stickers) stickers.push(st);
    const centres = [4, 13, 22, 31, 40, 49];//sample index of each face's middle sticker
    const grouping = groupColours(stickers, centres);
    const classRgb = centres.map(c => stickers[c].rgb);
    //Try the three namings of photo 2.
    let best = null;
    for(const photo2Faces of PHOTO2_CANDIDATES){
        const facelets = faceletsFromLabels(grouping.labels, photo2Faces);
        const problem = CubieCube.fromFacelets(facelets).verify();
        const candidate = {facelets, valid: problem === "", problem, photo2Faces, labels: grouping.labels, swapped: null};
        if(candidate.valid){ best = candidate; break; }
        if(!best) best = candidate;
    }
    if(!best.valid){
        //Repair: swap the two stickers whose exchange costs least and makes
        //a valid cube. Centres stay fixed.
        let bestSwap = null;
        for(const photo2Faces of PHOTO2_CANDIDATES){
            for(let i = 0; i < 54; i++){
                if(centres.includes(i)) continue;
                for(let j = i + 1; j < 54; j++){
                    if(centres.includes(j) || grouping.labels[i] === grouping.labels[j]) continue;
                    const li = grouping.labels[i], lj = grouping.labels[j];
                    const extra = grouping.distances[i][lj] + grouping.distances[j][li] - grouping.distances[i][li] - grouping.distances[j][lj];
                    if(bestSwap && extra >= bestSwap.extra) continue;
                    const labels = grouping.labels.slice();
                    labels[i] = lj; labels[j] = li;
                    const facelets = faceletsFromLabels(labels, photo2Faces);
                    if(CubieCube.fromFacelets(facelets).verify() === ""){
                        bestSwap = {extra, facelets, labels, photo2Faces, swapped: [i, j]};
                    }
                }
            }
        }
        if(bestSwap){
            best = {facelets: bestSwap.facelets, valid: true, problem: "", photo2Faces: bestSwap.photo2Faces,
                    labels: bestSwap.labels, swapped: bestSwap.swapped};
        }
    }
    best.classRgb = classRgb;
    best.message = best.valid
        ? (best.swapped ? "Valid cube after swapping two stickers that looked alike. Check them in the net below." : "Valid cube.")
        : "This is not a valid cube: " + best.problem + ". Fix the stickers in the net below.";
    return best;
}

//---- step 1: keypoint detection ----------------------------------------------

//Best-effort guess of the 7 keypoints. The cube is assumed to be the big
//object in the middle that differs from the colour of the image border.
//Returns {centre, ring} in image pixels, or a default hexagon if nothing
//cube-like is found.
export function autoDetectKeypoints(image){
    const {width, height} = image;
    //Work on a reduced image for speed.
    const step = Math.max(1, Math.floor(Math.max(width, height) / 160));
    const w = Math.floor(width / step), h = Math.floor(height / step);
    const px = (x, y) => pixelAt(image, x * step + step / 2, y * step + step / 2);
    //Background colour: median of a frame along the border.
    const frame = [];
    const margin = Math.max(1, Math.floor(Math.min(w, h) * 0.04));
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
        if(x < margin || y < margin || x >= w - margin || y >= h - margin) frame.push(px(x, y));
    }
    const bg = [0, 1, 2].map(c => median(frame.map(p => p[c])));
    //Mask of pixels that are not background: a different hue, or a lot
    //darker or brighter. Mild shading of the background (a vignette, a
    //gradient on the table) should not count, so brightness needs a big gap.
    const mask = new Uint8Array(w * h);
    const bgSum = bg[0] + bg[1] + bg[2] + 1;
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
        const p = px(x, y);
        const sum = p[0] + p[1] + p[2] + 1;
        let hueDiff = 0;
        for(let c = 0; c < 3; c++) hueDiff += Math.abs(p[c] / sum - bg[c] / bgSum);
        const brightnessDiff = Math.abs(sum - bgSum) / 3;
        //Very dark pixels are the cube's plastic body, whatever the background.
        const dark = sum < 0.45 * bgSum && sum < 240;
        mask[y * w + x] = (hueDiff > 0.16 || brightnessDiff > 70 || dark) ? 1 : 0;
    }
    //Largest connected component (4-neighbour flood fill).
    const comp = new Int32Array(w * h).fill(-1);
    let bestComp = -1, bestSize = 0, count = 0;
    const stack = [];
    for(let start = 0; start < w * h; start++){
        if(!mask[start] || comp[start] >= 0) continue;
        let size = 0;
        stack.push(start); comp[start] = count;
        while(stack.length){
            const i = stack.pop(); size++;
            const x = i % w, y = Math.floor(i / w);
            for(const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]){
                if(nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const j = ny * w + nx;
                if(mask[j] && comp[j] < 0){ comp[j] = count; stack.push(j); }
            }
        }
        if(size > bestSize){ bestSize = size; bestComp = count; }
        count++;
    }
    if(bestSize < w * h * 0.02) return defaultKeypoints(width, height);
    //Close small holes between stickers by taking the convex hull of the blob.
    const pts = [];
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) if(comp[y * w + x] === bestComp) pts.push([x * step + step / 2, y * step + step / 2]);
    const hull = convexHull(pts);
    const hex = hexagonFromHull(hull);
    if(!hex) return defaultKeypoints(width, height);
    return hexagonToKeypoints(hex, image);
}

export function defaultKeypoints(width, height){
    const cx = width / 2, cy = height / 2, r = Math.min(width, height) * 0.36;
    const ring = [];
    for(let i = 0; i < 6; i++){
        const a = -Math.PI / 2 + i * Math.PI / 3;
        ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return {centre: [cx, cy], ring};
}

//Reduces a convex polygon to the 6 of its vertices that enclose the largest
//area. The silhouette of a cube seen from a corner is a hexagon, and the
//six real corners enclose more area than any six noise points along the
//edges. Dynamic programming over the hull order, trying every start vertex.
export function hexagonFromHull(hull){
    const n = hull.length;
    if(n < 6) return null;
    if(n === 6) return hull.map(p => p.slice());
    const tri = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    let bestArea = -1, bestHex = null;
    for(let s = 0; s < n; s++){
        //dp[m][j]: largest area of a fan of m vertices from s ending at s+j; from[m][j] remembers the previous one.
        const dp = [], from = [];
        for(let m = 0; m <= 6; m++){ dp.push(new Array(n).fill(-1)); from.push(new Array(n).fill(-1)); }
        dp[1][0] = 0;
        for(let m = 2; m <= 6; m++){
            for(let j = m - 1; j < n; j++){
                for(let i = m - 2; i < j; i++){
                    if(dp[m - 1][i] < 0) continue;
                    const area = dp[m - 1][i] + (m === 2 ? 0 : tri(hull[s], hull[(s + i) % n], hull[(s + j) % n]));
                    if(area > dp[m][j]){ dp[m][j] = area; from[m][j] = i; }
                }
            }
        }
        for(let j = 5; j < n; j++){
            if(dp[6][j] > bestArea){
                bestArea = dp[6][j];
                const idx = [];
                let m = 6, cur = j;
                while(m >= 1){ idx.push((s + cur) % n); cur = from[m][cur]; m--; }
                bestHex = idx.reverse().map(k => hull[k].slice());
            }
        }
    }
    return bestHex;
}

//Decides which three hexagon vertices are joined to the near vertex and
//where that near vertex is. Each visible face is roughly a parallelogram,
//so edge_k + edge_{k+1} - far_between_them estimates the near vertex. The
//three cube edges that meet there are dark lines (the gaps between the
//stickers of neighbouring faces), so for each parity the estimate is refined
//to the point whose three segments to the candidate edge vertices are
//darkest, and the parity with the darker segments wins.
export function hexagonToKeypoints(hex, image){
    const size = Math.max(...hex.map(p => Math.hypot(p[0] - hex[0][0], p[1] - hex[0][1])));
    //Point-in-hexagon test that works whichever way round the hull goes:
    //inside points are on the same side of every edge as the polygon itself.
    let orientation = 0;
    for(let i = 0; i < 6; i++){
        const a = hex[i], b = hex[(i + 1) % 6];
        orientation += a[0] * b[1] - b[0] * a[1];
    }
    const inside = p => {
        for(let i = 0; i < 6; i++){
            const a = hex[i], b = hex[(i + 1) % 6];
            const side = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
            if(side * orientation < 0) return false;
        }
        return true;
    };
    let best = null;
    for(const parity of [0, 1]){
        const edges = [hex[parity % 6], hex[(parity + 2) % 6], hex[(parity + 4) % 6]];
        const estimates = [];
        for(let k = 0; k < 3; k++){
            const e1 = hex[(parity + 2 * k) % 6], far = hex[(parity + 2 * k + 1) % 6], e2 = hex[(parity + 2 * k + 2) % 6];
            estimates.push([e1[0] + e2[0] - far[0], e1[1] + e2[1] - far[1]]);
        }
        const guess = [0, 1].map(c => estimates.reduce((s, e) => s + e[c], 0) / 3);
        let centre = guess;
        let darkest = Infinity;
        if(image){
            //Brightness of the three segments plus a pull towards the
            //parallelogram guess, so the search does not settle on the
            //cube's outline, which is a dark line as well.
            const score = c => edges.reduce((s, e) => s + segmentBrightness(image, c, e), 0)
                + 500 * Math.hypot(c[0] - guess[0], c[1] - guess[1]) / size;
            //Coarse search over the hexagon, then a fine search around the best spot.
            const xs = hex.map(p => p[0]), ys = hex.map(p => p[1]);
            const coarse = Math.max(2, size / 22);
            for(let y = Math.min(...ys); y <= Math.max(...ys); y += coarse){
                for(let x = Math.min(...xs); x <= Math.max(...xs); x += coarse){
                    if(!inside([x, y])) continue;
                    const b = score([x, y]);
                    if(b < darkest){ darkest = b; centre = [x, y]; }
                }
            }
            const start = centre;
            for(let dy = -coarse; dy <= coarse; dy += 1){
                for(let dx = -coarse; dx <= coarse; dx += 1){
                    const c = [start[0] + dx, start[1] + dy];
                    const b = score(c);
                    if(b < darkest){ darkest = b; centre = c; }
                }
            }
        }else{
            darkest = parity;
        }
        if(!best || darkest < best.darkest) best = {darkest, parity, centre};
    }
    const ring = [];
    for(let i = 0; i < 6; i++) ring.push(hex[(best.parity + i) % 6].slice());
    return normalizeRing({centre: best.centre, ring});
}

//Mean brightness along the middle part of the segment a-b.
function segmentBrightness(image, a, b){
    let sum = 0, n = 0;
    for(let t = 0.15; t <= 0.85; t += 0.035){
        const p = pixelAt(image, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        sum += p[0] + p[1] + p[2];
        n++;
    }
    return sum / n;
}
