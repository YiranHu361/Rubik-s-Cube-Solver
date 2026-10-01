//JavaScript port of the C++ two-phase solver (src/Cube.cpp, Coords.cpp,
//Pruning.cpp, Solver.cpp). It is a line-by-line translation with the same
//table layouts, the same search order and the same random number generator,
//so "cube3 vectors" from the C++ build and solveVectors() here print the
//same move sequences. tests/solver.test.js checks exactly that.
//
//Runs in the browser (inside a Web Worker, see worker.js) and in Node.

//---- names and tables ------------------------------------------------------

export const Corner = {URF: 0, UFL: 1, ULB: 2, UBR: 3, DFR: 4, DLF: 5, DBL: 6, DRB: 7};
export const Edge = {UR: 0, UF: 1, UL: 2, UB: 3, DR: 4, DF: 5, DL: 6, DB: 7, FR: 8, FL: 9, BL: 10, BR: 11};
export const Face = {U: 0, R: 1, F: 2, D: 3, L: 4, B: 5};
export const FACE_NAMES = "URFDLB";
const {URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB} = Corner;
const {UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR} = Edge;
const {U, R, F, D, L, B} = Face;

//Facelet index = face * 9 + row * 3 + column (see Cube.h for the layout).
export const CORNER_FACELET = [
    [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
    [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]
];
export const EDGE_FACELET = [
    [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
    [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]
];
export const CORNER_COLOR = [
    [U, R, F], [U, F, L], [U, L, B], [U, B, R],
    [D, F, R], [D, L, F], [D, B, L], [D, R, B]
];
export const EDGE_COLOR = [
    [U, R], [U, F], [U, L], [U, B], [D, R], [D, F],
    [D, L], [D, B], [F, R], [F, L], [B, L], [B, R]
];
const CORNER_NAMES = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
const EDGE_NAMES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];

//---- random numbers (xorshift32, identical to Random in Cube.h) ------------

export class Random{
    constructor(seed){
        this.state = (seed >>> 0) || 0x9E3779B9;
    }
    next(){
        let x = this.state;
        x ^= x << 13; x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5; x >>>= 0;
        this.state = x;
        return x;
    }
    nextInt(n){
        return this.next() % n;
    }
}

//---- cubie-level cube ------------------------------------------------------

export class CubieCube{
    constructor(){
        this.cp = [0, 1, 2, 3, 4, 5, 6, 7];
        this.co = [0, 0, 0, 0, 0, 0, 0, 0];
        this.ep = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        this.eo = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    static make(cp, co, ep, eo){
        const c = new CubieCube();
        c.cp = cp.slice(); c.co = co.slice(); c.ep = ep.slice(); c.eo = eo.slice();
        return c;
    }

    clone(){
        return CubieCube.make(this.cp, this.co, this.ep, this.eo);
    }

    //this followed by other
    multiply(b){
        const r = new CubieCube();
        for(let i = 0; i < 8; i++){
            r.cp[i] = this.cp[b.cp[i]];
            r.co[i] = (this.co[b.cp[i]] + b.co[i]) % 3;
        }
        for(let i = 0; i < 12; i++){
            r.ep[i] = this.ep[b.ep[i]];
            r.eo[i] = (this.eo[b.ep[i]] + b.eo[i]) % 2;
        }
        return r;
    }

    inverse(){
        const r = new CubieCube();
        for(let i = 0; i < 8; i++){
            r.cp[this.cp[i]] = i;
            r.co[this.cp[i]] = (3 - this.co[i]) % 3;
        }
        for(let i = 0; i < 12; i++){
            r.ep[this.ep[i]] = i;
            r.eo[this.ep[i]] = this.eo[i];
        }
        return r;
    }

    applyMove(move){
        const face = Math.floor(move / 3), turns = move % 3 + 1;
        let c = this;
        for(let k = 0; k < turns; k++) c = c.multiply(Moves.BASIC[face]);
        this.cp = c.cp; this.co = c.co; this.ep = c.ep; this.eo = c.eo;
        return this;
    }

    applyMoves(moves){
        for(const m of moves) this.applyMove(m);
        return this;
    }

    equals(o){
        for(let i = 0; i < 8; i++) if(this.cp[i] !== o.cp[i] || this.co[i] !== o.co[i]) return false;
        for(let i = 0; i < 12; i++) if(this.ep[i] !== o.ep[i] || this.eo[i] !== o.eo[i]) return false;
        return true;
    }

    isSolved(){
        return this.equals(new CubieCube());
    }

    toFacelets(){
        const f = new Array(54).fill("?");
        for(let i = 0; i < 8; i++){
            for(let n = 0; n < 3; n++){
                f[CORNER_FACELET[i][(n + this.co[i]) % 3]] = FACE_NAMES[CORNER_COLOR[this.cp[i]][n]];
            }
        }
        for(let i = 0; i < 12; i++){
            for(let n = 0; n < 2; n++){
                f[EDGE_FACELET[i][(n + this.eo[i]) % 2]] = FACE_NAMES[EDGE_COLOR[this.ep[i]][n]];
            }
        }
        for(let face = 0; face < 6; face++) f[face * 9 + 4] = FACE_NAMES[face];
        return f.join("");
    }

    static fromFacelets(facelets){
        const c = new CubieCube();
        c.cp.fill(-1); c.co.fill(0); c.ep.fill(-1); c.eo.fill(0);
        if(typeof facelets !== "string" || facelets.length !== 54) return c;
        const f = [];
        for(let i = 0; i < 54; i++){
            const face = FACE_NAMES.indexOf(facelets[i]);
            if(face < 0) return c;
            f.push(face);
        }
        for(let i = 0; i < 8; i++){
            let ori = 0;
            while(ori < 3 && f[CORNER_FACELET[i][ori]] !== U && f[CORNER_FACELET[i][ori]] !== D) ori++;
            if(ori === 3) continue;
            const col1 = f[CORNER_FACELET[i][(ori + 1) % 3]];
            const col2 = f[CORNER_FACELET[i][(ori + 2) % 3]];
            for(let j = 0; j < 8; j++){
                if(col1 === CORNER_COLOR[j][1] && col2 === CORNER_COLOR[j][2]){
                    c.cp[i] = j;
                    c.co[i] = ori;
                    break;
                }
            }
        }
        for(let i = 0; i < 12; i++){
            const a = f[EDGE_FACELET[i][0]], b = f[EDGE_FACELET[i][1]];
            for(let j = 0; j < 12; j++){
                if(a === EDGE_COLOR[j][0] && b === EDGE_COLOR[j][1]){ c.ep[i] = j; c.eo[i] = 0; break; }
                if(a === EDGE_COLOR[j][1] && b === EDGE_COLOR[j][0]){ c.ep[i] = j; c.eo[i] = 1; break; }
            }
        }
        return c;
    }

    //"" when the cube is solvable, otherwise a short reason.
    verify(){
        const cornerCount = new Array(8).fill(0), edgeCount = new Array(12).fill(0);
        for(let i = 0; i < 8; i++){
            if(this.cp[i] < 0 || this.cp[i] > 7) return `the corner at ${CORNER_NAMES[i]} has an impossible colour combination`;
            cornerCount[this.cp[i]]++;
        }
        for(let i = 0; i < 12; i++){
            if(this.ep[i] < 0 || this.ep[i] > 11) return `the edge at ${EDGE_NAMES[i]} has an impossible colour combination`;
            edgeCount[this.ep[i]]++;
        }
        for(let i = 0; i < 8; i++) if(cornerCount[i] !== 1) return `the ${CORNER_NAMES[i]} corner appears ${cornerCount[i]} times`;
        for(let i = 0; i < 12; i++) if(edgeCount[i] !== 1) return `the ${EDGE_NAMES[i]} edge appears ${edgeCount[i]} times`;
        let twist = 0, flip = 0;
        for(let i = 0; i < 8; i++) twist += this.co[i];
        for(let i = 0; i < 12; i++) flip += this.eo[i];
        if(twist % 3 !== 0) return "one corner is twisted (total twist is not a multiple of 3)";
        if(flip % 2 !== 0) return "one edge is flipped (an odd number of edges are flipped)";
        if(parity(this.cp) !== parity(this.ep)) return "two pieces are swapped (corner and edge parity differ)";
        return "";
    }

    static random(rng){
        const c = new CubieCube();
        for(let i = 7; i > 0; i--){
            const j = rng.nextInt(i + 1);
            [c.cp[i], c.cp[j]] = [c.cp[j], c.cp[i]];
        }
        for(let i = 11; i > 0; i--){
            const j = rng.nextInt(i + 1);
            [c.ep[i], c.ep[j]] = [c.ep[j], c.ep[i]];
        }
        if(parity(c.cp) !== parity(c.ep)) [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
        let sum = 0;
        for(let i = 0; i < 7; i++){ c.co[i] = rng.nextInt(3); sum += c.co[i]; }
        c.co[7] = (3 - sum % 3) % 3;
        sum = 0;
        for(let i = 0; i < 11; i++){ c.eo[i] = rng.nextInt(2); sum += c.eo[i]; }
        c.eo[11] = sum % 2;
        return c;
    }
}

function parity(p){
    let par = 0;
    for(let i = 0; i < p.length; i++) for(let j = i + 1; j < p.length; j++) if(p[i] > p[j]) par ^= 1;
    return par;
}

//---- moves -----------------------------------------------------------------

export const Moves = {
    COUNT: 18,
    BASIC: [
        CubieCube.make([UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB], [0, 0, 0, 0, 0, 0, 0, 0],
                       [UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        CubieCube.make([DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR], [2, 0, 0, 1, 1, 0, 0, 2],
                       [FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        CubieCube.make([UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB], [1, 2, 0, 0, 2, 1, 0, 0],
                       [UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
        CubieCube.make([URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR], [0, 0, 0, 0, 0, 0, 0, 0],
                       [UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        CubieCube.make([URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB], [0, 1, 2, 0, 0, 2, 1, 0],
                       [UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        CubieCube.make([URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL], [0, 0, 1, 2, 0, 0, 2, 1],
                       [UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1])
    ],
    name(move){
        return FACE_NAMES[Math.floor(move / 3)] + ["", "2", "'"][move % 3];
    },
    parse(token){
        if(!token || token.length > 2) return -1;
        const face = FACE_NAMES.indexOf(token[0]);
        if(face < 0) return -1;
        let power = 0;
        if(token.length === 2){
            if(token[1] === "2") power = 1;
            else if(token[1] === "'") power = 2;
            else return -1;
        }
        return face * 3 + power;
    },
    inverse(move){
        return Math.floor(move / 3) * 3 + (2 - move % 3);
    },
    isPhase2(move){
        const face = Math.floor(move / 3);
        return face === U || face === D || move % 3 === 1;
    },
    parseSequence(text){
        return String(text).split(/\s+/).map(t => Moves.parse(t)).filter(m => m >= 0);
    },
    toString(moves){
        return moves.map(m => Moves.name(m)).join(" ");
    }
};

//---- facelet helpers -------------------------------------------------------

const SAME = 0, CW = 1, HALF = 2, CCW = 3;
function spinIndex(spin, row, col){
    switch(spin){
        case CW: return (2 - col) * 3 + row;
        case HALF: return (2 - row) * 3 + (2 - col);
        case CCW: return col * 3 + (2 - row);
        default: return row * 3 + col;
    }
}

const ROTATIONS = {
    x: {from: [F, R, D, B, L, U], spin: [SAME, CW, SAME, HALF, CCW, HALF]},
    y: {from: [U, B, R, D, F, L], spin: [CW, SAME, SAME, CCW, SAME, SAME]},
    z: {from: [L, U, F, R, D, B], spin: [CW, CW, CW, CW, CW, CCW]}
};

const SIDE_STRIPS = [
    [[18, 19, 20], [36, 37, 38], [45, 46, 47], [9, 10, 11]],
    [[20, 23, 26], [2, 5, 8], [51, 48, 45], [29, 32, 35]],
    [[6, 7, 8], [9, 12, 15], [29, 28, 27], [44, 41, 38]],
    [[24, 25, 26], [15, 16, 17], [51, 52, 53], [42, 43, 44]],
    [[0, 3, 6], [18, 21, 24], [27, 30, 33], [53, 50, 47]],
    [[2, 1, 0], [36, 39, 42], [33, 34, 35], [17, 14, 11]]
];

export const Facelets = {
    SOLVED: "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
    rotate(facelets, axis){
        const {from, spin} = ROTATIONS[axis];
        const out = new Array(54);
        for(let face = 0; face < 6; face++){
            for(let row = 0; row < 3; row++){
                for(let col = 0; col < 3; col++){
                    out[face * 9 + row * 3 + col] = facelets[from[face] * 9 + spinIndex(spin[face], row, col)];
                }
            }
        }
        return out.join("");
    },
    relabelByCentres(facelets){
        const map = {};
        for(let face = 0; face < 6; face++) map[facelets[face * 9 + 4]] = FACE_NAMES[face];
        return Array.from(facelets, ch => map[ch] || "?").join("");
    },
    applyMove(facelets, move){
        const face = Math.floor(move / 3), turns = move % 3 + 1;
        let cur = facelets.split("");
        for(let t = 0; t < turns; t++){
            const next = cur.slice();
            for(let row = 0; row < 3; row++){
                for(let col = 0; col < 3; col++){
                    next[face * 9 + row * 3 + col] = cur[face * 9 + spinIndex(CW, row, col)];
                }
            }
            for(let k = 0; k < 4; k++){
                for(let i = 0; i < 3; i++){
                    next[SIDE_STRIPS[face][(k + 1) % 4][i]] = cur[SIDE_STRIPS[face][k][i]];
                }
            }
            cur = next;
        }
        return cur.join("");
    }
};

//---- coordinates and move tables -------------------------------------------

export const Coords = {
    N_TWIST: 2187, N_FLIP: 2048, N_SLICE: 495,
    N_CORNER_PERM: 40320, N_UD_EDGE_PERM: 40320, N_SLICE_PERM: 24,
    PHASE2_MOVES: [0, 1, 2, 4, 7, 9, 10, 11, 13, 16],
    twistMove: null, flipMove: null, sliceMove: null,
    cornerPermMove: null, udEdgePermMove: null, slicePermMove: null,

    twist(c){ let t = 0; for(let i = 0; i < 7; i++) t = t * 3 + c.co[i]; return t; },
    setTwist(c, twist){
        let sum = 0;
        for(let i = 6; i >= 0; i--){ c.co[i] = twist % 3; sum += c.co[i]; twist = Math.floor(twist / 3); }
        c.co[7] = (3 - sum % 3) % 3;
    },
    flip(c){ let f = 0; for(let i = 0; i < 11; i++) f = f * 2 + c.eo[i]; return f; },
    setFlip(c, flip){
        let sum = 0;
        for(let i = 10; i >= 0; i--){ c.eo[i] = flip % 2; sum += c.eo[i]; flip = Math.floor(flip / 2); }
        c.eo[11] = sum % 2;
    },
    slice(c){
        let s = 0, k = 0;
        for(let j = 11; j >= 0; j--){
            if(c.ep[j] >= FR){ s += choose(11 - j, k + 1); k++; }
        }
        return s;
    },
    setSlice(c, slice){
        const sliceEdges = [FR, FL, BL, BR], otherEdges = [UR, UF, UL, UB, DR, DF, DL, DB];
        c.ep.fill(-1);
        let k = 3;
        for(let j = 0; j < 12; j++){
            if(slice - choose(11 - j, k + 1) >= 0){
                c.ep[j] = sliceEdges[3 - k];
                slice -= choose(11 - j, k + 1);
                k--;
            }
        }
        let next = 0;
        for(let j = 0; j < 12; j++) if(c.ep[j] === -1) c.ep[j] = otherEdges[next++];
    },
    cornerPerm(c){ return permToIndex(c.cp, 0, 8); },
    setCornerPerm(c, idx){ indexToPerm(idx, c.cp, 0, 8, 0); },
    udEdgePerm(c){ return permToIndex(c.ep, 0, 8); },
    setUdEdgePerm(c, idx){ indexToPerm(idx, c.ep, 0, 8, 0); },
    slicePerm(c){ return permToIndex(c.ep, 8, 4); },
    setSlicePerm(c, idx){ indexToPerm(idx, c.ep, 8, 4, 8); },

    init(){
        if(this.twistMove) return;
        this.twistMove = buildTable(this.N_TWIST, this.twist, this.setTwist, false);
        this.flipMove = buildTable(this.N_FLIP, this.flip, this.setFlip, false);
        this.sliceMove = buildTable(this.N_SLICE, this.slice, this.setSlice, false);
        this.cornerPermMove = buildTable(this.N_CORNER_PERM, this.cornerPerm, this.setCornerPerm, false);
        this.udEdgePermMove = buildTable(this.N_UD_EDGE_PERM, this.udEdgePerm, this.setUdEdgePerm, true);
        this.slicePermMove = buildTable(this.N_SLICE_PERM, this.slicePerm, this.setSlicePerm, true);
    }
};

function choose(n, k){
    if(k < 0 || k > n) return 0;
    let r = 1;
    for(let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
}

//Lehmer rank of p[offset .. offset+n-1]; identity -> 0.
function permToIndex(p, offset, n){
    let idx = 0;
    for(let i = 0; i < n; i++){
        let smallerAfter = 0;
        for(let j = i + 1; j < n; j++) if(p[offset + j] < p[offset + i]) smallerAfter++;
        idx = idx * (n - i) + smallerAfter;
    }
    return idx;
}

function indexToPerm(idx, p, offset, n, base){
    const digit = new Array(n);
    for(let i = n - 1; i >= 0; i--){
        digit[i] = idx % (n - i);
        idx = Math.floor(idx / (n - i));
    }
    const used = new Array(n).fill(false);
    for(let i = 0; i < n; i++){
        let count = 0;
        for(let v = 0; v < n; v++){
            if(used[v]) continue;
            if(count === digit[i]){ p[offset + i] = v + base; used[v] = true; break; }
            count++;
        }
    }
}

function buildTable(size, get, set, phase2Only){
    const table = new Uint16Array(size * Moves.COUNT);
    for(let coord = 0; coord < size; coord++){
        const base = new CubieCube();
        set(base, coord);
        for(let m = 0; m < Moves.COUNT; m++){
            if(phase2Only && !Moves.isPhase2(m)) continue;
            const c = base.clone();
            c.applyMove(m);
            table[coord * Moves.COUNT + m] = get(c);
        }
    }
    return table;
}

//---- pruning tables --------------------------------------------------------

export const Pruning = {
    sliceTwist: null, sliceFlip: null, twistFlip: null, sliceCornerPerm: null, sliceUdEdgePerm: null,
    init(){
        if(this.sliceTwist) return;
        Coords.init();
        const all = [...Array(Moves.COUNT).keys()];
        const C = Coords;
        this.sliceTwist = fill(C.N_SLICE, C.N_TWIST, C.sliceMove, C.twistMove, all);
        this.sliceFlip = fill(C.N_SLICE, C.N_FLIP, C.sliceMove, C.flipMove, all);
        this.twistFlip = fill(C.N_TWIST, C.N_FLIP, C.twistMove, C.flipMove, all);
        this.sliceCornerPerm = fill(C.N_SLICE_PERM, C.N_CORNER_PERM, C.slicePermMove, C.cornerPermMove, C.PHASE2_MOVES);
        this.sliceUdEdgePerm = fill(C.N_SLICE_PERM, C.N_UD_EDGE_PERM, C.slicePermMove, C.udEdgePermMove, C.PHASE2_MOVES);
    }
};

const EMPTY = 0xFF;
function fill(sizeA, sizeB, moveA, moveB, moves){
    const table = new Uint8Array(sizeA * sizeB).fill(EMPTY);
    table[0] = 0;
    let filled = 1, depth = 0;
    while(filled < sizeA * sizeB){
        let progress = false;
        for(let a = 0; a < sizeA; a++){
            for(let b = 0; b < sizeB; b++){
                if(table[a * sizeB + b] !== depth) continue;
                for(const m of moves){
                    const na = moveA[a * 18 + m], nb = moveB[b * 18 + m];
                    const slot = na * sizeB + nb;
                    if(table[slot] === EMPTY){
                        table[slot] = depth + 1;
                        filled++;
                        progress = true;
                    }
                }
            }
        }
        if(!progress) break;
        depth++;
    }
    return table;
}

//---- the two-phase search --------------------------------------------------

export class Solver{
    static PHASE2_MAX_DEPTH = 11;
    static PROBE_COUNT = 6;

    constructor(){
        Pruning.init();
        this.nodes = 0;
    }

    //Same contract as Solver::solve in C++: returns "R U2 ..." or "".
    solve(cube, maxLength = 24, stopLength = 24, timeMs = 0){
        if(typeof cube === "string") cube = CubieCube.fromFacelets(cube);
        if(cube.verify() !== "") return "";
        this.setupProbes(cube);
        this.best = [];
        this.bestLength = maxLength + 1;
        this.stopLength = stopLength;
        this.done = false;
        this.nodes = 0;
        this.timed = timeMs > 0;
        this.deadline = Date.now() + timeMs;
        if(cube.isSolved()) return "";
        for(let depth1 = 0; depth1 <= 12 && depth1 < this.bestLength && !this.done; depth1++){
            for(const p of this.probes){
                p.moves1.length = 0;
                this.phase1(p, p.twist, p.flip, p.slice, depth1, -1);
                if(this.done) break;
            }
        }
        return Moves.toString(this.best);
    }

    setupProbes(cube){
        const axes = [" ", "x", "z"];
        this.probes = [];
        const original = cube.toFacelets();
        for(let k = 0; k < Solver.PROBE_COUNT; k++){
            const rotated = axes[k % 3] === " " ? original : Facelets.rotate(original, axes[k % 3]);
            const faceMap = [];
            for(let face = 0; face < 6; face++) faceMap.push(FACE_NAMES.indexOf(rotated[face * 9 + 4]));
            let c = CubieCube.fromFacelets(Facelets.relabelByCentres(rotated));
            const inverted = k >= 3;
            if(inverted) c = c.inverse();
            this.probes.push({
                cube: c, faceMap, inverted,
                twist: Coords.twist(c), flip: Coords.flip(c), slice: Coords.slice(c),
                moves1: [], moves2: []
            });
        }
    }

    checkTime(){
        if(this.timed && Date.now() >= this.deadline) this.done = true;
    }

    phase1(p, twist, flip, slice, depth, lastFace){
        if(depth === 0){
            if(twist === 0 && flip === 0 && slice === 0){
                if(p.moves1.length > 0 && Moves.isPhase2(p.moves1[p.moves1.length - 1])) return;
                this.startPhase2(p, lastFace);
            }
            return;
        }
        const C = Coords, P = Pruning;
        let h = P.sliceTwist[slice * C.N_TWIST + twist];
        h = Math.max(h, P.sliceFlip[slice * C.N_FLIP + flip]);
        h = Math.max(h, P.twistFlip[twist * C.N_FLIP + flip]);
        if(h > depth) return;
        if((++this.nodes & 4095) === 0) this.checkTime();
        for(let face = 0; face < 6; face++){
            if(face === lastFace || face === lastFace - 3) continue;
            for(let power = 0; power < 3; power++){
                const m = face * 3 + power;
                p.moves1.push(m);
                this.phase1(p, C.twistMove[twist * 18 + m], C.flipMove[flip * 18 + m], C.sliceMove[slice * 18 + m], depth - 1, face);
                p.moves1.pop();
                if(this.done) return;
            }
        }
    }

    startPhase2(p, lastFace){
        const C = Coords, P = Pruning;
        const c = p.cube.clone().applyMoves(p.moves1);
        const cornerPerm = C.cornerPerm(c), udEdgePerm = C.udEdgePerm(c), slicePerm = C.slicePerm(c);
        const maxDepth2 = Math.min(Solver.PHASE2_MAX_DEPTH, this.bestLength - 1 - p.moves1.length);
        const h = Math.max(P.sliceCornerPerm[slicePerm * C.N_CORNER_PERM + cornerPerm],
                           P.sliceUdEdgePerm[slicePerm * C.N_UD_EDGE_PERM + udEdgePerm]);
        for(let depth2 = h; depth2 <= maxDepth2; depth2++){
            p.moves2.length = 0;
            if(this.phase2(p, cornerPerm, udEdgePerm, slicePerm, depth2, lastFace)){
                this.record(p);
                return;
            }
            if(this.done) return;
        }
    }

    phase2(p, cornerPerm, udEdgePerm, slicePerm, depth, lastFace){
        const C = Coords, P = Pruning;
        if(depth === 0) return cornerPerm === 0 && udEdgePerm === 0 && slicePerm === 0;
        const h = Math.max(P.sliceCornerPerm[slicePerm * C.N_CORNER_PERM + cornerPerm],
                           P.sliceUdEdgePerm[slicePerm * C.N_UD_EDGE_PERM + udEdgePerm]);
        if(h > depth) return false;
        if((++this.nodes & 4095) === 0) this.checkTime();
        for(let k = 0; k < 10; k++){
            const m = C.PHASE2_MOVES[k];
            const face = Math.floor(m / 3);
            if(face === lastFace || face === lastFace - 3) continue;
            p.moves2.push(m);
            const found = this.phase2(p, C.cornerPermMove[cornerPerm * 18 + m], C.udEdgePermMove[udEdgePerm * 18 + m],
                                      C.slicePermMove[slicePerm * 18 + m], depth - 1, face);
            if(found) return true;
            p.moves2.pop();
            if(this.done) return false;
        }
        return false;
    }

    record(p){
        let moves = p.moves1.concat(p.moves2);
        if(moves.length >= this.bestLength) return;
        if(p.inverted) moves = moves.reverse().map(m => Moves.inverse(m));
        moves = moves.map(m => p.faceMap[Math.floor(m / 3)] * 3 + m % 3);
        this.best = moves;
        this.bestLength = moves.length;
        if(this.bestLength <= this.stopLength) this.done = true;
    }
}

//Mirror of "cube3 vectors COUNT --stop N --seed S": returns "facelets solution" lines.
export function solveVectors(count = 100, stop = 24, seed = 777){
    const rng = new Random(seed);
    const solver = new Solver();
    const lines = [];
    for(let i = 0; i < count; i++){
        const cube = CubieCube.random(rng);
        lines.push(cube.toFacelets() + " " + solver.solve(cube, 24, stop, 0));
    }
    return lines;
}
