#ifndef CUBE_H
#define CUBE_H
#include <string>
#include <vector>
#include <cstdint>
using namespace std;

//A 3x3 cube is modelled at the "cubie" level: 8 corner pieces and 12 edge
//pieces, each with a position and an orientation. Centres never move, so
//they are not stored. This is the representation Kociemba's algorithm uses.

//Corner positions, named after the three faces they touch.
enum Corner{URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB};
//Edge positions. The last four (FR, FL, BL, BR) form the middle "UD slice".
enum Edge{UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR};
//Faces, in the order the 54-character facelet strings use them.
enum Face{U, R, F, D, L, B};

//Facelet string layout (Kociemba's convention): 9 characters per face in the
//order U R F D L B. Each face is read row by row, left to right, as seen when
//looking straight at it with the cube held so that U is on top (for U itself,
//B is at the top of the picture; for D, F is at the top).
//Facelet index = face * 9 + row * 3 + column. The centre of face f is 9f + 4.
extern const int CORNER_FACELET[8][3];//facelets of each corner, U/D sticker first, then clockwise
extern const int EDGE_FACELET[12][2]; //facelets of each edge, U/D (or F/B) sticker first
extern const Face CORNER_COLOR[8][3]; //colours of each corner in the solved cube, same order
extern const Face EDGE_COLOR[12][2];
extern const char FACE_NAMES[7];      //"URFDLB"

class CubieCube{
    public:
        int cp[8];  //cp[i] = which corner currently sits in position i
        int co[8];  //co[i] = how that corner is twisted: 0, 1 (clockwise), 2
        int ep[12]; //ep[i] = which edge currently sits in position i
        int eo[12]; //eo[i] = whether that edge is flipped (0 or 1)

        CubieCube();                              //the solved cube
        static CubieCube fromFacelets(const string& facelets);
        string toFacelets() const;

        //"this * other": the state reached by applying the permutation "other"
        //after "this". Applying a move = multiplying by that move's cube.
        CubieCube multiply(const CubieCube& other) const;
        CubieCube inverse() const;
        void applyMove(int move);                 //move index 0..17, see Moves
        void applyMoves(const vector<int>& moves);
        bool isSolved() const;
        //Returns "" when the cube can be built from a real cube, otherwise a
        //short reason (a sticker was misread, a corner is twisted, ...).
        string verify() const;
        bool operator==(const CubieCube& other) const;

        //Random reachable cube, using the caller's generator so results can
        //be reproduced (the JavaScript port uses the same generator).
        template<class Rng> static CubieCube random(Rng& rng);
};

//The 18 face moves: index = face * 3 + (quarter turns - 1).
//So U=0, U2=1, U'=2, R=3, R2=4, R'=5, F=6, ... B'=17.
namespace Moves{
    const int COUNT = 18;
    extern const CubieCube BASIC[6];              //one clockwise quarter turn per face
    string name(int move);                        //5 -> "R'"
    int parse(const string& token);               //"R'" -> 5, -1 if not a move
    int inverse(int move);                        //R -> R', R2 -> R2
    bool isPhase2(int move);                      //U, U2, U', D, D2, D', R2, L2, F2, B2
    vector<int> parseSequence(const string& text);//"R U R' U'" -> {3, 0, 5, 2}
    string toString(const vector<int>& moves);
}

//Helpers that work on facelet strings directly.
namespace Facelets{
    const string SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    //Turn the whole cube: 'x' like an R turn of every layer, 'y' like U, 'z' like F.
    string rotate(const string& facelets, char axis);
    //Rename colours so that each centre shows its own face letter again. After
    //a whole-cube rotation this gives the same physical cube in standard
    //colour notation.
    string relabelByCentres(const string& facelets);
    //Apply one face move to a facelet string by moving stickers around the
    //cube geometrically. Only used by the tests, to cross-check the cubie moves.
    string applyMove(const string& facelets, int move);
}

//Tiny deterministic random number generator (xorshift32). Both the C++ and
//the JavaScript solver use it, so "scramble --seed 7" means the same cube in both.
class Random{
    public:
        uint32_t state;
        explicit Random(uint32_t seed){ state = seed ? seed : 0x9E3779B9u; }
        uint32_t next(){
            uint32_t x = state;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            state = x;
            return x;
        }
        int nextInt(int n){ return (int)(next() % (uint32_t)n); }
};

template<class Rng> CubieCube CubieCube::random(Rng& rng){
    CubieCube c;
    //Fisher-Yates shuffles of the pieces.
    for(int i = 7; i > 0; i--){
        int j = rng.nextInt(i + 1);
        swap(c.cp[i], c.cp[j]);
    }
    for(int i = 11; i > 0; i--){
        int j = rng.nextInt(i + 1);
        swap(c.ep[i], c.ep[j]);
    }
    //A real cube always has corner parity == edge parity; fix it with one swap.
    int cornerParity = 0, edgeParity = 0;
    for(int i = 0; i < 8; i++) for(int j = i + 1; j < 8; j++) if(c.cp[i] > c.cp[j]) cornerParity ^= 1;
    for(int i = 0; i < 12; i++) for(int j = i + 1; j < 12; j++) if(c.ep[i] > c.ep[j]) edgeParity ^= 1;
    if(cornerParity != edgeParity) swap(c.ep[0], c.ep[1]);
    //Orientations: the last piece is forced by the others.
    int sum = 0;
    for(int i = 0; i < 7; i++){ c.co[i] = rng.nextInt(3); sum += c.co[i]; }
    c.co[7] = (3 - sum % 3) % 3;
    sum = 0;
    for(int i = 0; i < 11; i++){ c.eo[i] = rng.nextInt(2); sum += c.eo[i]; }
    c.eo[11] = sum % 2;
    return c;
}

#endif
