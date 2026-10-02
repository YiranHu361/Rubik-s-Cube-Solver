#include "Solver.h"
#include <algorithm>
#include <cstring>

Solver::Solver(){
    Pruning::init();
    bestLength = 0;
    stopLength = 0;
    done = false;
    nodes = 0;
    timed = false;
}

string Solver::solve(const string& facelets, int maxLength, int stopLength, int timeMs){
    return solve(CubieCube::fromFacelets(facelets), maxLength, stopLength, timeMs);
}

string Solver::solve(const CubieCube& cube, int maxLength, int stopLen, int timeMs){
    if(cube.verify() != "") return "";
    setupProbes(cube);
    best.clear();
    bestLength = maxLength + 1;//a solution counts only if it beats this
    stopLength = stopLen;
    done = false;
    nodes = 0;
    timed = timeMs > 0;
    deadline = chrono::steady_clock::now() + chrono::milliseconds(timeMs);
    if(cube.isSolved()) return "";

    //Iterative deepening on the phase-1 length. The probes take turns at
    //each depth, so whichever view of the cube is easiest wins early.
    //Phase 1 never needs more than 12 moves.
    for(int depth1 = 0; depth1 <= 12 && depth1 < bestLength && !done; depth1++){
        for(Probe& p : probes){
            p.moves1.clear();
            phase1(p, p.twist, p.flip, p.slice, depth1, -1);
            if(done) break;
        }
    }
    return Moves::toString(best);
}

//The three axes and the inverse give six probes. Rotating the facelet string
//and relabelling by centres gives the same physical cube held differently, so
//the solver can run unchanged; faceMap remembers which original face each
//rotated face is, to translate the solution back.
void Solver::setupProbes(const CubieCube& cube){
    const char axes[3] = {' ', 'x', 'z'};
    probes.clear();
    string original = cube.toFacelets();
    for(int k = 0; k < PROBE_COUNT; k++){
        Probe p;
        string rotated = (axes[k % 3] == ' ') ? original : Facelets::rotate(original, axes[k % 3]);
        for(int face = 0; face < 6; face++){
            const char* ptr = strchr(FACE_NAMES, rotated[face * 9 + 4]);
            p.faceMap[face] = ptr - FACE_NAMES;
        }
        p.cube = CubieCube::fromFacelets(Facelets::relabelByCentres(rotated));
        p.inverted = k >= 3;
        if(p.inverted) p.cube = p.cube.inverse();
        p.twist = Coords::twist(p.cube);
        p.flip = Coords::flip(p.cube);
        p.slice = Coords::slice(p.cube);
        probes.push_back(p);
    }
}

void Solver::checkTime(){
    if(timed && chrono::steady_clock::now() >= deadline) done = true;
}

//IDA* over (twist, flip, slice). A branch is cut when any pruning table says
//the remaining depth cannot be enough. Moves of the same face never follow
//each other, and opposite faces are only tried in one order (U before D,
//R before L, F before B), since "D U" and "U D" are the same.
void Solver::phase1(Probe& p, int twist, int flip, int slice, int depth, int lastFace){
    if(depth == 0){
        if(twist == 0 && flip == 0 && slice == 0){
            //A phase-1 solution ending in a phase-2 move is skipped: the same
            //path shows up as a shorter phase 1 followed by a longer phase 2.
            if(!p.moves1.empty() && Moves::isPhase2(p.moves1.back())) return;
            startPhase2(p, lastFace);
        }
        return;
    }
    using namespace Coords;
    int h = Pruning::sliceTwist[slice * N_TWIST + twist];
    h = max(h, (int)Pruning::sliceFlip[slice * N_FLIP + flip]);
    h = max(h, (int)Pruning::twistFlip[twist * N_FLIP + flip]);
    if(h > depth) return;
    if((++nodes & 4095) == 0) checkTime();
    for(int face = 0; face < 6; face++){
        if(face == lastFace || face == lastFace - 3) continue;
        for(int power = 0; power < 3; power++){
            int m = face * 3 + power;
            p.moves1.push_back(m);
            phase1(p, twistMove[twist * 18 + m], flipMove[flip * 18 + m], sliceMove[slice * 18 + m], depth - 1, face);
            p.moves1.pop_back();
            if(done) return;
        }
    }
}

//Called with the cube in G1 after p.moves1. Runs the phase-1 moves on the
//real cube to get the phase-2 coordinates, then IDA* with the phase-2 moves,
//bounded so that the total beats the best solution found so far.
void Solver::startPhase2(Probe& p, int lastFace){
    using namespace Coords;
    CubieCube c = p.cube;
    c.applyMoves(p.moves1);
    int cornerPerm = Coords::cornerPerm(c);
    int udEdgePerm = Coords::udEdgePerm(c);
    int slicePerm = Coords::slicePerm(c);
    int maxDepth2 = min(PHASE2_MAX_DEPTH, bestLength - 1 - (int)p.moves1.size());
    int h = max(Pruning::sliceCornerPerm[slicePerm * N_CORNER_PERM + cornerPerm],
                Pruning::sliceUdEdgePerm[slicePerm * N_UD_EDGE_PERM + udEdgePerm]);
    for(int depth2 = h; depth2 <= maxDepth2; depth2++){
        p.moves2.clear();
        if(phase2(p, cornerPerm, udEdgePerm, slicePerm, depth2, lastFace)){
            record(p);
            return;
        }
        if(done) return;
    }
}

bool Solver::phase2(Probe& p, int cornerPerm, int udEdgePerm, int slicePerm, int depth, int lastFace){
    using namespace Coords;
    if(depth == 0) return cornerPerm == 0 && udEdgePerm == 0 && slicePerm == 0;
    int h = max(Pruning::sliceCornerPerm[slicePerm * N_CORNER_PERM + cornerPerm],
                Pruning::sliceUdEdgePerm[slicePerm * N_UD_EDGE_PERM + udEdgePerm]);
    if(h > depth) return false;
    if((++nodes & 4095) == 0) checkTime();
    for(int k = 0; k < 10; k++){
        int m = PHASE2_MOVES[k];
        int face = m / 3;
        if(face == lastFace || face == lastFace - 3) continue;
        p.moves2.push_back(m);
        bool found = phase2(p, cornerPermMove[cornerPerm * 18 + m], udEdgePermMove[udEdgePerm * 18 + m],
                            slicePermMove[slicePerm * 18 + m], depth - 1, face);
        if(found) return true;
        p.moves2.pop_back();
        if(done) return false;
    }
    return false;
}

//Translates the probe's solution back to the original cube and keeps it if
//it is the shortest so far.
void Solver::record(const Probe& p){
    vector<int> moves = p.moves1;
    moves.insert(moves.end(), p.moves2.begin(), p.moves2.end());
    if((int)moves.size() >= bestLength) return;
    if(p.inverted){
        //The probe solved the inverse cube, so its solution *is* the scramble
        //of the real cube: undo it by playing it backwards, inverted.
        reverse(moves.begin(), moves.end());
        for(int& m : moves) m = Moves::inverse(m);
    }
    for(int& m : moves) m = p.faceMap[m / 3] * 3 + m % 3;
    best = moves;
    bestLength = moves.size();
    if(bestLength <= stopLength) done = true;
}
