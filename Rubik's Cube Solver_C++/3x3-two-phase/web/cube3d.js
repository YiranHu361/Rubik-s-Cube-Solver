//The animated 3D cube: draws the cube on a 2D canvas with the painter's
//algorithm (cubePolygons sorts the little boxes far to near) and animates
//one face turn at a time. The default viewpoint is the one of photo 1: the
//U, R and F faces, seen from the URF corner.
import {cameraFromDirection, normalize, rotateAround, cross} from "./geometry.js";
import {cubePolygons, turningLayer, STICKER_RGB} from "./render.js";
import {Facelets} from "./solver.js";

export class CubeView{
    constructor(canvas){
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.facelets = Facelets.SOLVED;
        this.palette = STICKER_RGB;
        this.direction = [1, 0.95, 1.05];//where the camera sits, relative to the cube
        this.turn = null;//{move, start, duration, resolve} while a face is turning
        this.reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.installOrbit();
        if(typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.draw()).observe(canvas);
        this.draw();
    }

    setFacelets(facelets){
        this.facelets = facelets;
        this.draw();
    }

    setPalette(palette){
        this.palette = palette;
        this.draw();
    }

    //Drag to look around the cube.
    installOrbit(){
        let last = null;
        this.canvas.addEventListener("pointerdown", e => { last = [e.clientX, e.clientY]; this.canvas.setPointerCapture(e.pointerId); });
        this.canvas.addEventListener("pointermove", e => {
            if(!last) return;
            const dx = e.clientX - last[0], dy = e.clientY - last[1];
            last = [e.clientX, e.clientY];
            let d = rotateAround(this.direction, [0, 1, 0], -dx * 0.01);
            const right = normalize(cross([0, 1, 0], d));
            d = rotateAround(d, right, dy * 0.01);
            //Keep the camera off the poles so "up" stays meaningful.
            if(Math.abs(normalize(d)[1]) < 0.97) this.direction = d;
            this.draw();
        });
        const stop = () => { last = null; };
        this.canvas.addEventListener("pointerup", stop);
        this.canvas.addEventListener("pointercancel", stop);
    }

    draw(){
        const canvas = this.canvas, ctx = this.ctx;
        const dpr = (typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
        const cssW = canvas.clientWidth || 320, cssH = canvas.clientHeight || 320;
        if(canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)){
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
        }
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const distance = 9;
        const focal = 1.35 * Math.min(w, h);
        const camera = cameraFromDirection(this.direction, distance, 0, focal, w, h);
        let turning = null;
        if(this.turn){
            const t = Math.min(1, (performance.now() - this.turn.start) / this.turn.duration);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            turning = turningLayer(this.turn.move, eased);
        }
        const polys = cubePolygons(this.facelets, camera, turning, this.palette);
        for(const p of polys){
            ctx.beginPath();
            ctx.moveTo(p.points[0][0], p.points[0][1]);
            for(let i = 1; i < 4; i++) ctx.lineTo(p.points[i][0], p.points[i][1]);
            ctx.closePath();
            const colour = `rgb(${p.rgb.map(c => Math.round(c)).join(",")})`;
            ctx.fillStyle = colour;
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();//hides the hairline seams between polygons
        }
    }

    //Animates one move and applies it to the facelets when done.
    animateMove(move, duration = 600){
        if(this.turn) return Promise.resolve();
        if(this.reducedMotion || duration <= 0){
            this.facelets = Facelets.applyMove(this.facelets, move);
            this.draw();
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this.turn = {move, start: performance.now(), duration, resolve};
            const frame = () => {
                if(!this.turn) return;
                const done = performance.now() - this.turn.start >= this.turn.duration;
                if(done){
                    const t = this.turn;
                    this.turn = null;
                    this.facelets = Facelets.applyMove(this.facelets, t.move);
                    this.draw();
                    t.resolve();
                }else{
                    this.draw();
                    requestAnimationFrame(frame);
                }
            };
            requestAnimationFrame(frame);
        });
    }
}
