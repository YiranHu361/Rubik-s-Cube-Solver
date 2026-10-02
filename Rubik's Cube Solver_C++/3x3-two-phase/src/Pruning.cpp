#include "Pruning.h"

namespace Pruning{
    vector<uint8_t> sliceTwist, sliceFlip, twistFlip, sliceCornerPerm, sliceUdEdgePerm;

    const uint8_t EMPTY = 0xFF;

    //Breadth-first search over the product of two coordinates. Entry
    //(a, b) lives at a * sizeB + b. "moves" lists which moves to use
    //(all 18 in phase 1, the 10 phase-2 moves in phase 2).
    static void fill(vector<uint8_t>& table, int sizeA, int sizeB,
                     const vector<uint16_t>& moveA, const vector<uint16_t>& moveB,
                     const int* moves, int moveCount){
        table.assign((size_t)sizeA * sizeB, EMPTY);
        table[0] = 0;
        int filled = 1, depth = 0;
        while(filled < sizeA * sizeB){
            bool progress = false;
            for(int a = 0; a < sizeA; a++){
                for(int b = 0; b < sizeB; b++){
                    if(table[(size_t)a * sizeB + b] != depth) continue;
                    for(int k = 0; k < moveCount; k++){
                        int m = moves[k];
                        int na = moveA[a * Moves::COUNT + m];
                        int nb = moveB[b * Moves::COUNT + m];
                        uint8_t& slot = table[(size_t)na * sizeB + nb];
                        if(slot == EMPTY){
                            slot = depth + 1;
                            filled++;
                            progress = true;
                        }
                    }
                }
            }
            if(!progress) break;//should not happen: every state is reachable
            depth++;
        }
    }

    void init(){
        if(!sliceTwist.empty()) return;
        Coords::init();
        int allMoves[Moves::COUNT];
        for(int m = 0; m < Moves::COUNT; m++) allMoves[m] = m;
        using namespace Coords;
        fill(sliceTwist, N_SLICE, N_TWIST, sliceMove, twistMove, allMoves, Moves::COUNT);
        fill(sliceFlip, N_SLICE, N_FLIP, sliceMove, flipMove, allMoves, Moves::COUNT);
        fill(twistFlip, N_TWIST, N_FLIP, twistMove, flipMove, allMoves, Moves::COUNT);
        fill(sliceCornerPerm, N_SLICE_PERM, N_CORNER_PERM, slicePermMove, cornerPermMove, PHASE2_MOVES, 10);
        fill(sliceUdEdgePerm, N_SLICE_PERM, N_UD_EDGE_PERM, slicePermMove, udEdgePermMove, PHASE2_MOVES, 10);
    }
}
