#ifndef PRUNING_H
#define PRUNING_H
#include "Coords.h"
#include <vector>
#include <cstdint>
using namespace std;

//Pruning tables are the heuristic of the IDA* search. For a pair of
//coordinates they store the exact number of moves needed to bring that pair
//to 0 (ignoring everything else about the cube). Because the real cube needs
//at least that many moves, the search can cut off any branch whose remaining
//depth is smaller than the table value.
//
//Every table is filled once by a breadth-first search from the solved state
//using the move tables. All five tables together take about 8.5 MB.
namespace Pruning{
    extern vector<uint8_t> sliceTwist;      //[slice * N_TWIST + twist]      phase 1
    extern vector<uint8_t> sliceFlip;       //[slice * N_FLIP + flip]        phase 1
    extern vector<uint8_t> twistFlip;       //[twist * N_FLIP + flip]        phase 1
    extern vector<uint8_t> sliceCornerPerm; //[slicePerm * N_CORNER_PERM + cornerPerm]   phase 2
    extern vector<uint8_t> sliceUdEdgePerm; //[slicePerm * N_UD_EDGE_PERM + udEdgePerm] phase 2

    void init();//builds all five tables (about one second)
}

#endif
