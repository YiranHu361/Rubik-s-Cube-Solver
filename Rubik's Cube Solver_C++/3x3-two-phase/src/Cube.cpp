#include "Cube.h"
#include <sstream>
#include <algorithm>
#include <cstring>

const char FACE_NAMES[7] = "URFDLB";

//Facelet index = face * 9 + row * 3 + column, e.g. U9 = 8, R1 = 9, F3 = 20.
const int CORNER_FACELET[8][3] = {
    {8, 9, 20},   //URF: U9 R1 F3
    {6, 18, 38},  //UFL: U7 F1 L3
    {0, 36, 47},  //ULB: U1 L1 B3
    {2, 45, 11},  //UBR: U3 B1 R3
    {29, 26, 15}, //DFR: D3 F9 R7
    {27, 44, 24}, //DLF: D1 L9 F7
    {33, 53, 42}, //DBL: D7 B9 L7
    {35, 17, 51}  //DRB: D9 R9 B7
};
const int EDGE_FACELET[12][2] = {
    {5, 10},  //UR: U6 R2
    {7, 19},  //UF: U8 F2
    {3, 37},  //UL: U4 L2
    {1, 46},  //UB: U2 B2
    {32, 16}, //DR: D6 R8
    {28, 25}, //DF: D2 F8
    {30, 43}, //DL: D4 L8
    {34, 52}, //DB: D8 B8
    {23, 12}, //FR: F6 R4
    {21, 41}, //FL: F4 L6
    {50, 39}, //BL: B6 L4
    {48, 14}  //BR: B4 R6
};
const Face CORNER_COLOR[8][3] = {
    {U, R, F}, {U, F, L}, {U, L, B}, {U, B, R},
    {D, F, R}, {D, L, F}, {D, B, L}, {D, R, B}
};
const Face EDGE_COLOR[12][2] = {
    {U, R}, {U, F}, {U, L}, {U, B}, {D, R}, {D, F},
    {D, L}, {D, B}, {F, R}, {F, L}, {B, L}, {B, R}
};

CubieCube::CubieCube(){
    for(int i = 0; i < 8; i++){ cp[i] = i; co[i] = 0; }
    for(int i = 0; i < 12; i++){ ep[i] = i; eo[i] = 0; }
}

//Builds a cube from arrays, used for the six basic moves below.
static CubieCube makeCube(const int* cp, const int* co, const int* ep, const int* eo){
    CubieCube c;
    for(int i = 0; i < 8; i++){ c.cp[i] = cp[i]; c.co[i] = co[i]; }
    for(int i = 0; i < 12; i++){ c.ep[i] = ep[i]; c.eo[i] = eo[i]; }
    return c;
}

//Each basic move is written as "the solved cube after that one turn":
//cp[i] = which corner ends up in position i, etc. Only R, F, L, B twist corners
//and only F and B flip edges. tests.cpp cross-checks every table against a
//purely geometric sticker-moving implementation (Facelets::applyMove).
namespace Moves{
    static const int cpU[8] = {UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB};
    static const int coU[8] = {0, 0, 0, 0, 0, 0, 0, 0};
    static const int epU[12] = {UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR};
    static const int eoU[12] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

    static const int cpR[8] = {DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR};
    static const int coR[8] = {2, 0, 0, 1, 1, 0, 0, 2};
    static const int epR[12] = {FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR};
    static const int eoR[12] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

    static const int cpF[8] = {UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB};
    static const int coF[8] = {1, 2, 0, 0, 2, 1, 0, 0};
    static const int epF[12] = {UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR};
    static const int eoF[12] = {0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0};

    static const int cpD[8] = {URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR};
    static const int coD[8] = {0, 0, 0, 0, 0, 0, 0, 0};
    static const int epD[12] = {UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR};
    static const int eoD[12] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

    static const int cpL[8] = {URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB};
    static const int coL[8] = {0, 1, 2, 0, 0, 2, 1, 0};
    static const int epL[12] = {UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR};
    static const int eoL[12] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

    static const int cpB[8] = {URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL};
    static const int coB[8] = {0, 0, 1, 2, 0, 0, 2, 1};
    static const int epB[12] = {UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB};
    static const int eoB[12] = {0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1};

    const CubieCube BASIC[6] = {
        makeCube(cpU, coU, epU, eoU), makeCube(cpR, coR, epR, eoR),
        makeCube(cpF, coF, epF, eoF), makeCube(cpD, coD, epD, eoD),
        makeCube(cpL, coL, epL, eoL), makeCube(cpB, coB, epB, eoB)
    };

    string name(int move){
        static const char* suffix[3] = {"", "2", "'"};
        return string(1, FACE_NAMES[move / 3]) + suffix[move % 3];
    }

    int parse(const string& token){
        if(token.empty() || token.size() > 2) return -1;
        const char* f = strchr(FACE_NAMES, token[0]);
        if(!f || token[0] == '\0') return -1;
        int face = f - FACE_NAMES;
        int power = 0;
        if(token.size() == 2){
            if(token[1] == '2') power = 1;
            else if(token[1] == '\'') power = 2;
            else return -1;
        }
        return face * 3 + power;
    }

    int inverse(int move){
        int face = move / 3, power = move % 3;
        return face * 3 + (2 - power);
    }

    bool isPhase2(int move){
        int face = move / 3;
        return face == U || face == D || move % 3 == 1;
    }

    vector<int> parseSequence(const string& text){
        vector<int> moves;
        stringstream ss(text);
        string token;
        while(ss >> token){
            int m = parse(token);
            if(m >= 0) moves.push_back(m);
        }
        return moves;
    }

    string toString(const vector<int>& moves){
        string s;
        for(size_t i = 0; i < moves.size(); i++){
            if(i) s += ' ';
            s += name(moves[i]);
        }
        return s;
    }
}

CubieCube CubieCube::multiply(const CubieCube& b) const{
    CubieCube r;
    for(int i = 0; i < 8; i++){
        //The corner that b puts in position i came from position b.cp[i] of this cube.
        r.cp[i] = cp[b.cp[i]];
        r.co[i] = (co[b.cp[i]] + b.co[i]) % 3;
    }
    for(int i = 0; i < 12; i++){
        r.ep[i] = ep[b.ep[i]];
        r.eo[i] = (eo[b.ep[i]] + b.eo[i]) % 2;
    }
    return r;
}

CubieCube CubieCube::inverse() const{
    CubieCube r;
    for(int i = 0; i < 8; i++){
        r.cp[cp[i]] = i;
        r.co[cp[i]] = (3 - co[i]) % 3;
    }
    for(int i = 0; i < 12; i++){
        r.ep[ep[i]] = i;
        r.eo[ep[i]] = eo[i];
    }
    return r;
}

void CubieCube::applyMove(int move){
    int face = move / 3, turns = move % 3 + 1;
    for(int k = 0; k < turns; k++) *this = multiply(Moves::BASIC[face]);
}

void CubieCube::applyMoves(const vector<int>& moves){
    for(int m : moves) applyMove(m);
}

bool CubieCube::isSolved() const{
    return *this == CubieCube();
}

bool CubieCube::operator==(const CubieCube& o) const{
    for(int i = 0; i < 8; i++) if(cp[i] != o.cp[i] || co[i] != o.co[i]) return false;
    for(int i = 0; i < 12; i++) if(ep[i] != o.ep[i] || eo[i] != o.eo[i]) return false;
    return true;
}

string CubieCube::toFacelets() const{
    string f(54, '?');
    for(int i = 0; i < 8; i++){
        for(int n = 0; n < 3; n++){
            //Sticker n of the corner sitting here lands on facelet (n + twist) of position i.
            f[CORNER_FACELET[i][(n + co[i]) % 3]] = FACE_NAMES[CORNER_COLOR[cp[i]][n]];
        }
    }
    for(int i = 0; i < 12; i++){
        for(int n = 0; n < 2; n++){
            f[EDGE_FACELET[i][(n + eo[i]) % 2]] = FACE_NAMES[EDGE_COLOR[ep[i]][n]];
        }
    }
    for(int face = 0; face < 6; face++) f[face * 9 + 4] = FACE_NAMES[face];
    return f;
}

static int faceOf(char c){
    const char* p = strchr(FACE_NAMES, c);
    return (p && c != '\0') ? p - FACE_NAMES : -1;
}

//Unknown pieces are stored as -1 so that verify() can explain what went wrong.
CubieCube CubieCube::fromFacelets(const string& facelets){
    CubieCube c;
    for(int i = 0; i < 8; i++){ c.cp[i] = -1; c.co[i] = 0; }
    for(int i = 0; i < 12; i++){ c.ep[i] = -1; c.eo[i] = 0; }
    if(facelets.size() != 54) return c;
    int f[54];
    for(int i = 0; i < 54; i++){
        f[i] = faceOf(facelets[i]);
        if(f[i] < 0) return c;
    }
    for(int i = 0; i < 8; i++){
        //Find which of the three stickers shows U or D: that tells the twist.
        int ori = 0;
        while(ori < 3 && f[CORNER_FACELET[i][ori]] != U && f[CORNER_FACELET[i][ori]] != D) ori++;
        if(ori == 3) continue;
        int col1 = f[CORNER_FACELET[i][(ori + 1) % 3]];
        int col2 = f[CORNER_FACELET[i][(ori + 2) % 3]];
        for(int j = 0; j < 8; j++){
            if(col1 == CORNER_COLOR[j][1] && col2 == CORNER_COLOR[j][2]){
                c.cp[i] = j;
                c.co[i] = ori;
                break;
            }
        }
    }
    for(int i = 0; i < 12; i++){
        for(int j = 0; j < 12; j++){
            int a = f[EDGE_FACELET[i][0]], b = f[EDGE_FACELET[i][1]];
            if(a == EDGE_COLOR[j][0] && b == EDGE_COLOR[j][1]){ c.ep[i] = j; c.eo[i] = 0; break; }
            if(a == EDGE_COLOR[j][1] && b == EDGE_COLOR[j][0]){ c.ep[i] = j; c.eo[i] = 1; break; }
        }
    }
    return c;
}

string CubieCube::verify() const{
    static const char* cornerNames[8] = {"URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"};
    static const char* edgeNames[12] = {"UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"};
    int cornerCount[8] = {0}, edgeCount[12] = {0};
    for(int i = 0; i < 8; i++){
        if(cp[i] < 0 || cp[i] > 7) return string("the corner at ") + cornerNames[i] + " has an impossible colour combination";
        cornerCount[cp[i]]++;
    }
    for(int i = 0; i < 12; i++){
        if(ep[i] < 0 || ep[i] > 11) return string("the edge at ") + edgeNames[i] + " has an impossible colour combination";
        edgeCount[ep[i]]++;
    }
    for(int i = 0; i < 8; i++) if(cornerCount[i] != 1) return string("the ") + cornerNames[i] + " corner appears " + to_string(cornerCount[i]) + " times";
    for(int i = 0; i < 12; i++) if(edgeCount[i] != 1) return string("the ") + edgeNames[i] + " edge appears " + to_string(edgeCount[i]) + " times";
    int twist = 0, flip = 0;
    for(int i = 0; i < 8; i++) twist += co[i];
    for(int i = 0; i < 12; i++) flip += eo[i];
    if(twist % 3 != 0) return "one corner is twisted (total twist is not a multiple of 3)";
    if(flip % 2 != 0) return "one edge is flipped (an odd number of edges are flipped)";
    int cornerParity = 0, edgeParity = 0;
    for(int i = 0; i < 8; i++) for(int j = i + 1; j < 8; j++) if(cp[i] > cp[j]) cornerParity ^= 1;
    for(int i = 0; i < 12; i++) for(int j = i + 1; j < 12; j++) if(ep[i] > ep[j]) edgeParity ^= 1;
    if(cornerParity != edgeParity) return "two pieces are swapped (corner and edge parity differ)";
    return "";
}

namespace Facelets{
    //In-plane transforms of a 3x3 face: how facelet (row, col) of the new face
    //maps onto the old face.
    enum Spin{SAME, CW, HALF, CCW};
    static int spinIndex(int spin, int row, int col){
        switch(spin){
            case CW: return (2 - col) * 3 + row;
            case HALF: return (2 - row) * 3 + (2 - col);
            case CCW: return col * 3 + (2 - row);
            default: return row * 3 + col;
        }
    }

    string rotate(const string& facelets, char axis){
        //For every new face: which old face lands there and how it is spun.
        //Derived from the geometry of the R, U and F turns applied to all layers.
        int from[6], spin[6];
        if(axis == 'x'){
            int fr[6] = {F, R, D, B, L, U}; int sp[6] = {SAME, CW, SAME, HALF, CCW, HALF};
            copy(fr, fr + 6, from); copy(sp, sp + 6, spin);
        }else if(axis == 'y'){
            int fr[6] = {U, B, R, D, F, L}; int sp[6] = {CW, SAME, SAME, CCW, SAME, SAME};
            copy(fr, fr + 6, from); copy(sp, sp + 6, spin);
        }else{
            int fr[6] = {L, U, F, R, D, B}; int sp[6] = {CW, CW, CW, CW, CW, CCW};
            copy(fr, fr + 6, from); copy(sp, sp + 6, spin);
        }
        string out(54, '?');
        for(int face = 0; face < 6; face++){
            for(int row = 0; row < 3; row++){
                for(int col = 0; col < 3; col++){
                    out[face * 9 + row * 3 + col] = facelets[from[face] * 9 + spinIndex(spin[face], row, col)];
                }
            }
        }
        return out;
    }

    string relabelByCentres(const string& facelets){
        char colourToFace[128];
        for(int i = 0; i < 128; i++) colourToFace[i] = '?';
        for(int face = 0; face < 6; face++) colourToFace[(unsigned char)facelets[face * 9 + 4]] = FACE_NAMES[face];
        string out = facelets;
        for(char& ch : out) ch = colourToFace[(unsigned char)ch];
        return out;
    }

    //One clockwise quarter turn of a face moves its own 9 stickers and the 12
    //stickers of the neighbouring faces. Each neighbour strip is listed as the
    //3 facelet indices it covers; strip k moves onto strip k+1.
    static const int SIDE_STRIPS[6][4][3] = {
        {{18, 19, 20}, {36, 37, 38}, {45, 46, 47}, {9, 10, 11}},   //U: F top -> L top -> B top -> R top
        {{20, 23, 26}, {2, 5, 8}, {51, 48, 45}, {29, 32, 35}},     //R: F right -> U right -> B left -> D right
        {{6, 7, 8}, {9, 12, 15}, {29, 28, 27}, {44, 41, 38}},      //F: U bottom -> R left -> D top -> L right
        {{24, 25, 26}, {15, 16, 17}, {51, 52, 53}, {42, 43, 44}},  //D: F bottom -> R bottom -> B bottom -> L bottom
        {{0, 3, 6}, {18, 21, 24}, {27, 30, 33}, {53, 50, 47}},     //L: U left -> F left -> D left -> B right
        {{2, 1, 0}, {36, 39, 42}, {33, 34, 35}, {17, 14, 11}}      //B: U top -> L left -> D bottom -> R right
    };

    string applyMove(const string& facelets, int move){
        int face = move / 3, turns = move % 3 + 1;
        string cur = facelets;
        for(int t = 0; t < turns; t++){
            string next = cur;
            for(int row = 0; row < 3; row++){
                for(int col = 0; col < 3; col++){
                    next[face * 9 + row * 3 + col] = cur[face * 9 + spinIndex(CW, row, col)];
                }
            }
            for(int k = 0; k < 4; k++){
                for(int i = 0; i < 3; i++){
                    next[SIDE_STRIPS[face][(k + 1) % 4][i]] = cur[SIDE_STRIPS[face][k][i]];
                }
            }
            cur = next;
        }
        return cur;
    }
}
