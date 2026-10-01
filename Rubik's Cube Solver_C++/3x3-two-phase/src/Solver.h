#ifndef SOLVER_H
#define SOLVER_H
#include "Cube.h"
#include "Coords.h"
#include "Pruning.h"
#include <chrono>
#include <string>
#include <vector>
using namespace std;

//Kociemba's two-phase algorithm.
//
//Phase 1 uses IDA* (iterative deepening depth-first search with the pruning
//tables as heuristic) to reach the group G1, where every corner and edge is
//oriented and the four middle-slice edges are back in the middle slice.
//Phase 2 then solves the cube with only the moves that keep it in G1
//(U, D, R2, L2, F2, B2). Each phase-1 solution gets its own phase-2 search,
//and the search keeps going with longer phase-1 solutions because they often
//lead to a shorter total.
//
//To find short solutions quickly the solver also searches six "probes" of the
//same cube in turn: the cube seen from three different axes, and the inverse
//of each. A solution for any probe can be translated back to the original.
class Solver{
    public:
        Solver();//builds the move and pruning tables (about one second)

        //Searches for a solution of at most maxLength moves and returns it as
        //"R U2 F' ...", or "" if none was found. The search stops as soon as a
        //solution with stopLength moves or fewer is found, when timeMs
        //milliseconds have passed (timeMs <= 0: no time limit), or when the
        //search space is exhausted. With stopLength == maxLength the first
        //solution found is returned, which takes about a millisecond.
        string solve(const CubieCube& cube, int maxLength = 24, int stopLength = 24, int timeMs = 0);
        string solve(const string& facelets, int maxLength = 24, int stopLength = 24, int timeMs = 0);

        long long nodesVisited() const{ return nodes; }

        //Phase 2 is never searched deeper than this. Phase 1 has thousands of
        //solutions, so instead of finishing a long phase 2 (slow: the phase-2
        //pruning is weak) the solver moves on to the next phase-1 solution.
        //Measured on 300 random cubes: cap 18 gives 22.5 moves in 4.7 ms,
        //cap 11 gives 20.5 moves in 3.7 ms, cap 10 gives 20.1 moves in 8.6 ms.
        static const int PHASE2_MAX_DEPTH = 11;
        //The cube seen from three axes, and the inverse of each.
        static const int PROBE_COUNT = 6;

    private:
        //One view of the cube being solved. "cube" is the rotated (and maybe
        //inverted) cube the search actually works on; faceMap and inverted
        //say how to translate its moves back to the original cube.
        struct Probe{
            CubieCube cube;
            int twist, flip, slice;
            int faceMap[6];
            bool inverted;
            vector<int> moves1, moves2;//the current phase-1 and phase-2 paths
        };
        vector<Probe> probes;
        vector<int> best;//best solution so far, in original-cube moves
        int bestLength;
        int stopLength;
        bool done;
        long long nodes;
        bool timed;
        chrono::steady_clock::time_point deadline;

        void setupProbes(const CubieCube& cube);
        void phase1(Probe& p, int twist, int flip, int slice, int depth, int lastFace);
        void startPhase2(Probe& p, int lastFace);
        bool phase2(Probe& p, int cornerPerm, int udEdgePerm, int slicePerm, int depth, int lastFace);
        void record(const Probe& p);
        void checkTime();
};

#endif
