#ifndef COORDS_H
#define COORDS_H
#include "Cube.h"
#include <vector>
#include <cstdint>
using namespace std;

//Kociemba's two-phase algorithm does not search over whole cubes. It squeezes
//the parts of the state that matter into small integers ("coordinates") and
//pre-computes how every move changes each coordinate (the "move tables").
//
//Phase 1 brings the cube into the group G1 = <U, D, R2, L2, F2, B2>, which is
//exactly when these three coordinates are all 0:
//  twist  (0..2186): orientation of the 8 corners (3^7, the last is forced)
//  flip   (0..2047): orientation of the 12 edges (2^11)
//  slice  (0..494):  which 4 positions hold the FR, FL, BL, BR edges (12 choose 4)
//Phase 2 finishes the solve inside G1 using
//  cornerPerm (0..40319): permutation of the 8 corners
//  udEdgePerm (0..40319): permutation of the 8 edges in the U and D layers
//  slicePerm  (0..23):    permutation of the 4 edges in the middle slice
namespace Coords{
    const int N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495;
    const int N_CORNER_PERM = 40320, N_UD_EDGE_PERM = 40320, N_SLICE_PERM = 24;

    int twist(const CubieCube& c);
    int flip(const CubieCube& c);
    int slice(const CubieCube& c);
    int cornerPerm(const CubieCube& c);
    int udEdgePerm(const CubieCube& c);
    int slicePerm(const CubieCube& c);

    void setTwist(CubieCube& c, int twist);
    void setFlip(CubieCube& c, int flip);
    void setSlice(CubieCube& c, int slice);
    void setCornerPerm(CubieCube& c, int idx);
    void setUdEdgePerm(CubieCube& c, int idx);
    void setSlicePerm(CubieCube& c, int idx);

    //Move tables: table[coordinate * 18 + move] = coordinate after the move.
    //The two phase-2 edge tables are only filled for the 10 phase-2 moves.
    extern vector<uint16_t> twistMove, flipMove, sliceMove;
    extern vector<uint16_t> cornerPermMove, udEdgePermMove, slicePermMove;
    //The 10 moves allowed in phase 2, in the order the search tries them.
    extern const int PHASE2_MOVES[10];

    void init();//builds the move tables (fast, about 50 ms)
}

#endif
