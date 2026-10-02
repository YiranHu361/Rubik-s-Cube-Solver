//Software renderer that draws a cube into an RGBA pixel buffer. It makes the
//synthetic "sample photos" (so the app can be tried without a real cube) and
//gives the tests a camera, lighting and framing they can vary. No canvas is
//needed, so it also runs in Node.
import {FACE_AXES, stickerQuad, cameraFromDirection, projectKeypoints, dot, normalize, sub, scale, add, cross, rotateAround} from "./geometry.js";
import {FACE_NAMES} from "./solver.js";

//Sticker colours of a typical cube, by face letter.
export const STICKER_RGB = {
    U: [246, 246, 240], R: [196, 30, 58], F: [0, 158, 96],
    D: [255, 213, 0], L: [255, 88, 0], B: [0, 81, 186]
};

export function createImage(width, height){
    return {width, height, data: new Uint8ClampedArray(width * height * 4)};
}

//Fills a convex polygon (screen points [x, y]) by testing pixel centres
//against every edge. Fine for the few dozen polygons a photo needs.
export function fillConvex(image, points, rgb){
    const {width, height, data} = image;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const [x, y] of points){
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    //Orientation of the polygon, so the inside test works either way round.
    let area = 0;
    for(let i = 0; i < points.length; i++){
        const a = points[i], b = points[(i + 1) % points.length];
        area += a[0] * b[1] - b[0] * a[1];
    }
    const sign = area >= 0 ? 1 : -1;
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(width - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(height - 1, Math.ceil(maxY));
    for(let y = y0; y <= y1; y++){
        for(let x = x0; x <= x1; x++){
            const px = x + 0.5, py = y + 0.5;
            let inside = true;
            for(let i = 0; i < points.length && inside; i++){
                const a = points[i], b = points[(i + 1) % points.length];
                const side = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
                if(side * sign < 0) inside = false;
            }
            if(inside){
                const o = (y * width + x) * 4;
                data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
            }
        }
    }
}

//Convex hull of 2D points (Andrew's monotone chain), counterclockwise in
//maths coordinates, which is clockwise on screen.
export function convexHull(points){
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if(pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for(const p of pts){
        while(lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for(let i = pts.length - 1; i >= 0; i--){
        const p = pts[i];
        while(upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}

//Draws a cube given by its facelet string. Options:
//  camera      from geometry.makeCamera / cameraFromDirection
//  light       {direction: [x,y,z], ambient: 0..1, diffuse: 0..1, tint: [r,g,b] multipliers}
//  background  [r,g,b] (a soft vignette is added)
//  noise       amplitude of per-pixel noise, 0 for none
//  rng         object with next() -> uint32, used for the noise
//  palette     {U: [r,g,b], ...} sticker colours (defaults to STICKER_RGB)
//  layer       optional animated layer {face, angle} for the 3D viewer
export function renderCube(facelets, image, options){
    const {camera, light, background = [214, 212, 206], noise = 0, rng, palette = STICKER_RGB} = options;
    const {width, height, data} = image;
    //Background with a vignette so the cube silhouette has to be found.
    for(let y = 0; y < height; y++){
        for(let x = 0; x < width; x++){
            const dx = (x - width / 2) / width, dy = (y - height / 2) / height;
            const v = 1 - 0.5 * (dx * dx + dy * dy);
            const o = (y * width + x) * 4;
            data[o] = background[0] * v; data[o + 1] = background[1] * v; data[o + 2] = background[2] * v; data[o + 3] = 255;
        }
    }
    const lightDir = normalize(light.direction);
    const shade = n => Math.min(1, light.ambient + light.diffuse * Math.max(0, dot(n, lightDir)));
    //Cube body: the convex hull of the 8 projected vertices, in dark plastic.
    const vertices = [];
    for(const sx of [-1.5, 1.5]) for(const sy of [-1.5, 1.5]) for(const sz of [-1.5, 1.5]) vertices.push([sx, sy, sz]);
    fillConvex(image, convexHull(vertices.map(v => camera.project(v).slice(0, 2))), [28, 26, 26]);
    //Visible faces, back to front is not needed: faces of a convex cube never overlap.
    for(let face = 0; face < 6; face++){
        const n = FACE_AXES[face].n;
        const centre = scale(n, 1.5);
        if(dot(n, sub(camera.position, centre)) <= 0) continue;
        const s = shade(n);
        for(let row = 0; row < 3; row++){
            for(let col = 0; col < 3; col++){
                const letter = facelets[face * 9 + row * 3 + col];
                const base = palette[letter] || [120, 120, 120];
                const rgb = [0, 1, 2].map(i => Math.min(255, base[i] * s * (light.tint ? light.tint[i] : 1)));
                const quad = stickerQuad(face, row, col, 0.07).map(p => camera.project(p).slice(0, 2));
                fillConvex(image, quad, rgb);
            }
        }
    }
    if(noise > 0 && rng){
        for(let i = 0; i < data.length; i += 4){
            const d = ((rng.next() % 2001) / 1000 - 1) * noise;
            data[i] = Math.max(0, Math.min(255, data[i] + d));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + d));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + d));
        }
    }
    return image;
}

//A random camera looking at the given corner (signs like [1,1,1] for URF),
//tilted a little away from the exact diagonal and rolled by "roll".
//spread is the maximum tilt in radians.
export function randomCornerCamera(signs, rng, {width, height, roll = null, spread = 0.35, distance = null, focal = null} = {}){
    const unit = () => rng.next() / 4294967296;
    const diag = normalize(signs);
    //Two directions perpendicular to the diagonal for the tilt.
    const helper = Math.abs(diag[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const a = normalize(cross(diag, helper)), b = cross(diag, a);
    const t1 = (unit() * 2 - 1) * spread, t2 = (unit() * 2 - 1) * spread;
    const direction = normalize(add(add(diag, scale(a, Math.tan(t1))), scale(b, Math.tan(t2))));
    const dist = distance ?? 6.5 + unit() * 3;
    //Framing: the cube spans roughly 55 to 80 percent of the shorter side.
    const f = focal ?? (0.62 + unit() * 0.28) * Math.min(width, height) * dist / 6.5;
    const r = roll ?? unit() * Math.PI * 2;
    return cameraFromDirection(direction, dist, r, f, width, height);
}

//A camera that shows the cube exactly as the capture guide draws it: looking
//straight along the corner diagonal from far away, framed so the six outer
//vertices land on guideKeypoints(size). With roll 0 the U face is on top for
//the URF corner; roll PI gives the same "Y" layout for the DBL corner.
export function guideAlignedCamera(size, signs, roll = 0){
    //Far away, so the picture is nearly orthographic: the edge vertices are
    //0.87 units nearer than the far vertices, which would otherwise make
    //them project a few pixels further out than a regular hexagon.
    const distance = 200;
    //The six outer vertices sit sqrt(6) from the viewing axis.
    const focal = 0.36 * size * distance / Math.sqrt(6);
    return cameraFromDirection(signs, distance, roll, focal, size, size);
}

//Renders one corner photo and also returns the exact keypoints, which the
//tests use to separate colour problems from keypoint-detection problems.
export function renderCornerPhoto(facelets, signs, rng, options = {}){
    const width = options.width || 320, height = options.height || 320;
    const unit = () => rng.next() / 4294967296;
    const camera = options.camera || randomCornerCamera(signs, rng, {width, height, roll: options.roll, spread: options.spread});
    const light = options.light || {
        direction: [unit() * 2 - 1, 0.5 + unit(), unit() * 2 - 1],
        ambient: 0.35 + unit() * 0.25,
        diffuse: 0.35 + unit() * 0.35,
        tint: [0.92 + unit() * 0.12, 0.94 + unit() * 0.08, 0.88 + unit() * 0.18]
    };
    const background = options.background || [170 + unit() * 70, 170 + unit() * 70, 165 + unit() * 70];
    const image = createImage(width, height);
    renderCube(facelets, image, {camera, light, background, noise: options.noise ?? 6, rng, palette: options.palette});
    return {image, camera, light, keypoints: projectKeypoints(camera, signs)};
}

//Draws the cube for the 3D viewer: every cubie as a small box so that a
//layer can be turned part way. Returns polygons sorted far to near, each
//{points, rgb, depth}, for a canvas to draw.
export function cubePolygons(facelets, camera, turning = null, palette = STICKER_RGB){
    const polys = [];
    const h = 0.47;//half size of a cubie box, leaving a gap
    for(let x = -1; x <= 1; x++) for(let y = -1; y <= 1; y++) for(let z = -1; z <= 1; z++){
        if(x === 0 && y === 0 && z === 0) continue;
        const cubie = [x, y, z];
        //Cubies in the turning layer are rotated part way about the face axis.
        const inLayer = turning && cubie[turning.axisIndex] === turning.layer;
        const transform = p => inLayer ? rotateAround(p, turning.axis, turning.angle) : p;
        for(let face = 0; face < 6; face++){
            const ax = FACE_AXES[face];
            const centre = add(cubie, scale(ax.n, h));
            const u = scale(ax.col, h), v = scale(ax.row, h);
            //Only the outside of the cube is drawn, plus the two faces of the
            //cut while a layer is turning. Faces buried inside the cube would
            //only confuse the depth sort.
            const outward = dot(ax.n, cubie) > 0.5;
            let onCut = false;
            if(turning){
                const towards = ax.n[turning.axisIndex];//-1, 0 or +1 along the turning axis
                const pos = cubie[turning.axisIndex];
                onCut = (pos === turning.layer && towards === -turning.layer) || (pos === 0 && towards === turning.layer);
            }
            if(!outward && !onCut) continue;
            const box = [sub(sub(centre, u), v), add(sub(centre, u), v), add(add(centre, u), v), sub(add(centre, u), v)].map(transform);
            const worldNormal = transform(add(centre, ax.n)).map((c, i) => c - transform(centre)[i]);
            const viewDot = dot(worldNormal, sub(camera.position, transform(centre)));
            if(viewDot <= 0) continue;
            const proj = box.map(p => camera.project(p));
            const depth = proj.reduce((s, p) => s + p[2], 0) / 4;
            polys.push({points: proj.map(p => [p[0], p[1]]), rgb: [30, 28, 28], depth: depth + 0.001});
            if(outward){
                const letter = facelets[face * 9 + (Math.round(dot(cubie, ax.row)) + 1) * 3 + (Math.round(dot(cubie, ax.col)) + 1)];
                const s = 0.78 + 0.22 * Math.max(0, dot(normalize(worldNormal), normalize(sub(camera.position, [0, 0, 0]))));
                const sticker = [sub(sub(centre, scale(u, 0.86)), scale(v, 0.86)), add(sub(centre, scale(u, 0.86)), scale(v, 0.86)),
                                 add(add(centre, scale(u, 0.86)), scale(v, 0.86)), sub(add(centre, scale(u, 0.86)), scale(v, 0.86))]
                    .map(transform).map(p => camera.project(p));
                const base = palette[letter] || [120, 120, 120];
                polys.push({points: sticker.map(p => [p[0], p[1]]), rgb: base.map(c => c * s), depth: depth});
            }
        }
    }
    polys.sort((a, b) => b.depth - a.depth);
    return polys;
}

//Describes a part-way turn of one face for cubePolygons: a clockwise quarter
//turn of face f is a rotation of -90 degrees about its outward normal.
export function turningLayer(move, fraction){
    const face = Math.floor(move / 3), power = move % 3;
    const ax = FACE_AXES[face];
    const quarterTurns = power === 2 ? -1 : power + 1;//U: 1, U2: 2, U': -1
    const axisIndex = ax.n.findIndex(c => c !== 0);
    return {
        axis: ax.n, axisIndex, layer: ax.n[axisIndex],
        angle: -quarterTurns * (Math.PI / 2) * fraction
    };
}

export {FACE_NAMES};
