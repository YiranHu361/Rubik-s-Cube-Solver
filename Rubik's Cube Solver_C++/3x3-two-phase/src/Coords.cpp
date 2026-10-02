#include "Coords.h"

namespace Coords{
    vector<uint16_t> twistMove, flipMove, sliceMove;
    vector<uint16_t> cornerPermMove, udEdgePermMove, slicePermMove;
    const int PHASE2_MOVES[10] = {0, 1, 2, 4, 7, 9, 10, 11, 13, 16};//U U2 U' R2 F2 D D2 D' L2 B2

    //n choose k
    static int choose(int n, int k){
        if(k < 0 || k > n) return 0;
        long long r = 1;
        for(int i = 1; i <= k; i++) r = r * (n - k + i) / i;
        return (int)r;
    }

    //Ranks a permutation of n distinct values as a number in 0..n!-1 (Lehmer
    //code: for each element, count the smaller elements to its right). The
    //identity permutation gets 0. Only relative order matters, so a
    //permutation of {8,9,10,11} ranks exactly like one of {0,1,2,3}.
    static int permToIndex(const int* p, int n){
        int idx = 0;
        for(int i = 0; i < n; i++){
            int smallerAfter = 0;
            for(int j = i + 1; j < n; j++) if(p[j] < p[i]) smallerAfter++;
            idx = idx * (n - i) + smallerAfter;
        }
        return idx;
    }

    //Inverse of permToIndex; "base" is the smallest value of the permutation.
    static void indexToPerm(int idx, int* p, int n, int base){
        int digit[12];
        for(int i = n - 1; i >= 0; i--){
            digit[i] = idx % (n - i);
            idx /= (n - i);
        }
        bool used[12] = {false};
        for(int i = 0; i < n; i++){
            //p[i] is the digit[i]-th smallest value not used yet
            int count = 0;
            for(int v = 0; v < n; v++){
                if(used[v]) continue;
                if(count == digit[i]){ p[i] = v + base; used[v] = true; break; }
                count++;
            }
        }
    }

    int twist(const CubieCube& c){
        int t = 0;
        for(int i = 0; i < 7; i++) t = t * 3 + c.co[i];
        return t;
    }

    void setTwist(CubieCube& c, int twist){
        int sum = 0;
        for(int i = 6; i >= 0; i--){
            c.co[i] = twist % 3;
            sum += c.co[i];
            twist /= 3;
        }
        c.co[7] = (3 - sum % 3) % 3;
    }

    int flip(const CubieCube& c){
        int f = 0;
        for(int i = 0; i < 11; i++) f = f * 2 + c.eo[i];
        return f;
    }

    void setFlip(CubieCube& c, int flip){
        int sum = 0;
        for(int i = 10; i >= 0; i--){
            c.eo[i] = flip % 2;
            sum += c.eo[i];
            flip /= 2;
        }
        c.eo[11] = sum % 2;
    }

    //Combination rank of the 4 positions occupied by slice edges (FR..BR).
    //The solved cube (slice edges at positions 8..11) ranks 0.
    int slice(const CubieCube& c){
        int s = 0, k = 0;
        for(int j = 11; j >= 0; j--){
            if(c.ep[j] >= FR){
                s += choose(11 - j, k + 1);
                k++;
            }
        }
        return s;
    }

    void setSlice(CubieCube& c, int slice){
        const int sliceEdges[4] = {FR, FL, BL, BR};
        const int otherEdges[8] = {UR, UF, UL, UB, DR, DF, DL, DB};
        for(int j = 0; j < 12; j++) c.ep[j] = -1;
        //Undo the ranking from the lowest position upwards: a slice edge
        //goes at position j whenever the binomial it would contribute fits.
        int k = 3;
        for(int j = 0; j < 12; j++){
            if(slice - choose(11 - j, k + 1) >= 0){
                c.ep[j] = sliceEdges[3 - k];
                slice -= choose(11 - j, k + 1);
                k--;
            }
        }
        int next = 0;
        for(int j = 0; j < 12; j++) if(c.ep[j] == -1) c.ep[j] = otherEdges[next++];
    }

    int cornerPerm(const CubieCube& c){ return permToIndex(c.cp, 8); }
    void setCornerPerm(CubieCube& c, int idx){ indexToPerm(idx, c.cp, 8, 0); }

    int udEdgePerm(const CubieCube& c){ return permToIndex(c.ep, 8); }
    void setUdEdgePerm(CubieCube& c, int idx){ indexToPerm(idx, c.ep, 8, 0); }

    int slicePerm(const CubieCube& c){ return permToIndex(c.ep + 8, 4); }
    void setSlicePerm(CubieCube& c, int idx){ indexToPerm(idx, c.ep + 8, 4, 8); }

    //Generic table builder: for every coordinate value, rebuild a cube with
    //that coordinate, apply each move, and read the coordinate back.
    typedef int (*Getter)(const CubieCube&);
    typedef void (*Setter)(CubieCube&, int);
    static void buildTable(vector<uint16_t>& table, int size, Getter get, Setter set, bool phase2Only){
        table.assign(size * Moves::COUNT, 0);
        for(int coord = 0; coord < size; coord++){
            CubieCube base;
            set(base, coord);
            for(int m = 0; m < Moves::COUNT; m++){
                if(phase2Only && !Moves::isPhase2(m)) continue;
                CubieCube c = base;
                c.applyMove(m);
                table[coord * Moves::COUNT + m] = get(c);
            }
        }
    }

    void init(){
        if(!twistMove.empty()) return;
        buildTable(twistMove, N_TWIST, twist, setTwist, false);
        buildTable(flipMove, N_FLIP, flip, setFlip, false);
        buildTable(sliceMove, N_SLICE, slice, setSlice, false);
        buildTable(cornerPermMove, N_CORNER_PERM, cornerPerm, setCornerPerm, false);
        buildTable(udEdgePermMove, N_UD_EDGE_PERM, udEdgePerm, setUdEdgePerm, true);
        buildTable(slicePermMove, N_SLICE_PERM, slicePerm, setSlicePerm, true);
    }
}
