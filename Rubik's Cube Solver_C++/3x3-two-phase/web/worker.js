//Web Worker that owns the solver, so building the tables (a couple of
//seconds in JavaScript) and searching never freeze the page.
//Messages in:  {type: "init"}  {type: "solve", id, facelets, maxLength, stopLength, timeMs}
//Messages out: {type: "ready", ms}  {type: "solution", id, moves, ms}  {type: "error", id, message}
import {Solver} from "./solver.js";

let solver = null;

function ready(){
    if(!solver){
        const t = Date.now();
        solver = new Solver();
        postMessage({type: "ready", ms: Date.now() - t});
    }
    return solver;
}

onmessage = event => {
    const msg = event.data;
    if(msg.type === "init"){
        ready();
    }else if(msg.type === "solve"){
        try{
            const s = ready();
            const t = Date.now();
            const moves = s.solve(msg.facelets, msg.maxLength ?? 24, msg.stopLength ?? 24, msg.timeMs ?? 0);
            postMessage({type: "solution", id: msg.id, moves, ms: Date.now() - t});
        }catch(err){
            postMessage({type: "error", id: msg.id, message: String(err && err.message || err)});
        }
    }
};
