//Geometry shared by the photo pipeline, the synthetic photo renderer and the
//3D viewer: where every sticker sits in 3D, how a camera projects points,
//which cube vertices make up the 7 keypoints of a corner photo, and the
//homography that maps a face's 3x3 grid onto its photographed quadrilateral.
import {CORNER_FACELET, CORNER_COLOR, FACE_NAMES} from "./solver.js";

//Axes: x towards R, y towards U, z towards F (right-handed). The cube spans
//-1.5..1.5 on each axis, so sticker centres sit at -1, 0, 1 along a face.
//For each face: outward normal, the direction in which the facelet column
//grows and the direction in which the row grows. These follow the facelet
//string convention (see Cube.h): U is read with B at the top, D with F at the
//top, side faces with U at the top.
export const FACE_AXES = [
    {n: [0, 1, 0], col: [1, 0, 0], row: [0, 0, 1]},   //U
    {n: [1, 0, 0], col: [0, 0, -1], row: [0, -1, 0]}, //R
    {n: [0, 0, 1], col: [1, 0, 0], row: [0, -1, 0]},  //F
    {n: [0, -1, 0], col: [1, 0, 0], row: [0, 0, -1]}, //D
    {n: [-1, 0, 0], col: [0, 0, 1], row: [0, -1, 0]}, //L
    {n: [0, 0, -1], col: [-1, 0, 0], row: [0, -1, 0]} //B
];

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = a => Math.sqrt(dot(a, a));
export const normalize = a => scale(a, 1 / length(a));

//Rotates point p by angle (radians) around a unit axis (Rodrigues' formula).
export function rotateAround(p, axis, angle){
    const c = Math.cos(angle), s = Math.sin(angle);
    const k = axis;
    return add(add(scale(p, c), scale(cross(k, p), s)), scale(k, dot(k, p) * (1 - c)));
}

//Centre of sticker (row, col) of a face, in 3D.
export function stickerCentre(face, row, col){
    const ax = FACE_AXES[face];
    return add(add(scale(ax.n, 1.5), scale(ax.col, col - 1)), scale(ax.row, row - 1));
}

//The four 3D corners of sticker (row, col), shrunk by "inset" on every side
//(inset 0 gives the full 1x1 square, 0.05 leaves a thin gap).
export function stickerQuad(face, row, col, inset = 0.06){
    const ax = FACE_AXES[face];
    const c = stickerCentre(face, row, col);
    const h = 0.5 - inset;
    const u = scale(ax.col, h), v = scale(ax.row, h);
    return [
        sub(sub(c, u), v), add(sub(c, u), v), add(add(c, u), v), sub(add(c, u), v)
    ];
}

//Which cubie position (x, y, z in {-1, 0, 1}) carries sticker (face, row, col).
export function stickerCubie(face, row, col){
    const c = stickerCentre(face, row, col);
    const ax = FACE_AXES[face];
    return sub(c, scale(ax.n, 0.5)).map(Math.round);
}

//Simple pinhole camera. position/target/up in world units; focal in pixels.
export function makeCamera({position, target = [0, 0, 0], up = [0, 1, 0], focal, width, height}){
    const forward = normalize(sub(target, position));
    const right = normalize(cross(forward, up));
    const trueUp = cross(right, forward);
    return {
        position, forward, right, up: trueUp, focal, width, height,
        //Returns [x, y, depth] in pixels, y growing downwards like an image.
        project(p){
            const d = sub(p, position);
            const z = dot(d, forward);
            return [width / 2 + focal * dot(d, right) / z, height / 2 - focal * dot(d, trueUp) / z, z];
        }
    };
}

//A camera that looks at the origin from "direction" (any vector), rolled by
//"roll" radians about its viewing axis. Used by the synthetic photos and the
//3D viewer.
export function cameraFromDirection(direction, distance, roll, focal, width, height){
    const dir = normalize(direction);
    const position = scale(dir, distance);
    let up = Math.abs(dir[1]) > 0.95 ? [0, 0, -1] : [0, 1, 0];
    up = rotateAround(up, dir, roll);
    return makeCamera({position, up, focal, width, height});
}

export const opposite = face => (face + 3) % 6;

//The corner cubie that touches these three faces (any order).
export function cornerWithFaces(a, b, c){
    for(let i = 0; i < 8; i++){
        const faces = CORNER_COLOR[i];
        if(faces.includes(a) && faces.includes(b) && faces.includes(c)) return i;
    }
    throw new Error("no corner touches faces " + [a, b, c].map(f => FACE_NAMES[f]).join(""));
}

//Where corner cubie "corner" sits on face "face", as a facelet [row, col].
export function cornerCellOnFace(corner, face){
    for(let k = 0; k < 3; k++){
        if(CORNER_COLOR[corner][k] === face){
            const idx = CORNER_FACELET[corner][k] % 9;
            return [Math.floor(idx / 3), idx % 3];
        }
    }
    throw new Error("corner does not touch that face");
}

//A corner photo shows three faces meeting at one vertex. Seen from outside,
//going clockwise around that vertex, the faces are faces[0], faces[1],
//faces[2]. For image face k the photographed quadrilateral is
//[vertex, shared with the previous face, far corner, shared with the next face]
//and this returns, for those four quad corners, the matching grid corner of
//the face's 3x3 sticker grid as [x, y] with x along columns and y along rows,
//each 0 or 3. That is what the homography needs.
export function faceGridCorners(faces, k){
    const face = faces[k], prev = faces[(k + 2) % 3], next = faces[(k + 1) % 3];
    const vertexCorner = cornerWithFaces(face, prev, next);
    const sharedPrev = cornerWithFaces(face, prev, opposite(next));
    const far = cornerWithFaces(face, opposite(prev), opposite(next));
    const sharedNext = cornerWithFaces(face, opposite(prev), next);
    return [vertexCorner, sharedPrev, far, sharedNext].map(corner => {
        const [row, col] = cornerCellOnFace(corner, face);
        return [col === 0 ? 0 : 3, row === 0 ? 0 : 3];
    });
}

//Photo-relative grid of an image face: the quad [vertex, shared with the
//previous face, far corner, shared with the next face] is mapped onto this
//3x3 grid, so stickers can be read before knowing which cube face it is.
export const QUAD_GRID = [[0, 0], [3, 0], [3, 3], [0, 3]];

//Where the photo-relative cell (qrow, qcol) of image face k ends up on the
//cube face's own grid once the three faces are named: returns [row, col].
export function quadCellToFaceCell(faces, k, qrow, qcol){
    const [g0, g1, , g3] = faceGridCorners(faces, k);
    const fx = (qcol + 0.5) / 3, fy = (qrow + 0.5) / 3;
    const x = g0[0] + fx * (g1[0] - g0[0]) + fy * (g3[0] - g0[0]);
    const y = g0[1] + fx * (g1[1] - g0[1]) + fy * (g3[1] - g0[1]);
    return [Math.floor(y), Math.floor(x)];
}

//Keypoints of a corner photo: {centre: [x, y], ring: [[x, y] x 6]}. The ring
//goes clockwise on screen and ring[0] is a vertex joined to the centre by a
//cube edge (so ring[0], ring[2], ring[4] are edge vertices and ring[1],
//ring[3], ring[5] are the far corners of the three faces).
//Image face k is the quad [centre, ring[2k], ring[2k+1], ring[2k+2]].
export function faceQuads(keypoints){
    const {centre, ring} = keypoints;
    const quads = [];
    for(let k = 0; k < 3; k++){
        quads.push([centre, ring[2 * k], ring[2 * k + 1], ring[(2 * k + 2) % 6]]);
    }
    return quads;
}

//Makes the ring clockwise on screen (y grows downwards) without changing
//which vertices are edge vertices.
export function normalizeRing(keypoints){
    const ring = keypoints.ring.slice();
    let area = 0;
    for(let i = 0; i < 6; i++){
        const a = ring[i], b = ring[(i + 1) % 6];
        area += a[0] * b[1] - b[0] * a[1];
    }
    //With y downwards, a clockwise polygon has positive signed area here.
    if(area < 0){
        const reversed = [ring[0], ring[5], ring[4], ring[3], ring[2], ring[1]];
        return {centre: keypoints.centre, ring: reversed};
    }
    return {centre: keypoints.centre, ring};
}

//Index of the image face whose centroid is highest on screen; the faces are
//then taken in clockwise order starting from it.
export function topFaceOrder(keypoints){
    const quads = faceQuads(keypoints);
    let top = 0, bestY = Infinity;
    quads.forEach((q, k) => {
        const y = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
        if(y < bestY){ bestY = y; top = k; }
    });
    return [top, (top + 1) % 3, (top + 2) % 3];
}

//Projective transform mapping four source points onto four destination
//points (direct linear transform, solved as an 8x8 linear system).
export function homography(src, dst){
    const A = [], b = [];
    for(let i = 0; i < 4; i++){
        const [x, y] = src[i], [X, Y] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
        A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    const h = solveLinear(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(H, x, y){
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

//Gaussian elimination with partial pivoting.
export function solveLinear(A, b){
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for(let col = 0; col < n; col++){
        let pivot = col;
        for(let r = col + 1; r < n; r++) if(Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        [M[col], M[pivot]] = [M[pivot], M[col]];
        const p = M[col][col];
        if(Math.abs(p) < 1e-12) throw new Error("degenerate keypoints");
        for(let r = 0; r < n; r++){
            if(r === col) continue;
            const f = M[r][col] / p;
            for(let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map((row, i) => row[n] / row[i]);
}

//The 8 cube vertices, and the 7 keypoints seen from a corner: for corner
//signs like [1, 1, 1] (URF) the near vertex is the centre and the six
//vertices other than the far one form the ring.
export function cornerKeypoints3D(signs){
    const s = 1.5;
    const centre = signs.map(v => v * s);
    const edgeVertices = [], farVertices = [];
    for(let i = 0; i < 3; i++){
        const e = centre.slice(); e[i] = -e[i];
        edgeVertices.push(e);
        const f = centre.map(v => -v); f[i] = -f[i];
        farVertices.push(f);
    }
    return {centre, edgeVertices, farVertices};
}

//Projects the keypoints of a corner view and orders the ring clockwise on
//screen starting from an edge vertex.
export function projectKeypoints(camera, signs){
    const {centre, edgeVertices, farVertices} = cornerKeypoints3D(signs);
    const c = camera.project(centre);
    const pts = edgeVertices.map(p => ({p: camera.project(p), edge: true}))
        .concat(farVertices.map(p => ({p: camera.project(p), edge: false})));
    //Angle on screen (y downwards): sorting by increasing angle is clockwise.
    pts.forEach(q => q.angle = Math.atan2(q.p[1] - c[1], q.p[0] - c[0]));
    pts.sort((a, b) => a.angle - b.angle);
    let start = pts.findIndex(q => q.edge);
    const ring = [];
    for(let i = 0; i < 6; i++) ring.push(pts[(start + i) % 6].p.slice(0, 2));
    return {centre: c.slice(0, 2), ring};
}
