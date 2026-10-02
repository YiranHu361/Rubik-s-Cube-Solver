//Unit tests for the two-phase solver. Build and run with "make test".
//Every CHECK counts; the program exits non-zero if any fails.
#include "Solver.h"
#include <iostream>
#include <algorithm>
#include <cstring>
using namespace std;

static long checks = 0, failures = 0;
#define CHECK(cond) do{ checks++; if(!(cond)){ failures++; cerr << "FAILED line " << __LINE__ << ": " #cond "\n"; } }while(0)

static CubieCube randomCube(Random& rng){ return CubieCube::random(rng); }

static void testFaceletRoundTrip(){
    CubieCube solved;
    CHECK(solved.toFacelets() == Facelets::SOLVED);
    CHECK(CubieCube::fromFacelets(Facelets::SOLVED).isSolved());
    Random rng(1);
    for(int i = 0; i < 2000; i++){
        CubieCube c = randomCube(rng);
        CHECK(c.verify() == "");
        CubieCube back = CubieCube::fromFacelets(c.toFacelets());
        CHECK(back == c);
    }
}

//The cubie move tables were typed in by hand. Facelets::applyMove moves
//stickers around purely geometrically, so if both agree on every move from
//many different states, the tables are right.
static void testMovesAgainstGeometry(){
    Random rng(2);
    for(int i = 0; i < 500; i++){
        CubieCube c = randomCube(rng);
        string f = c.toFacelets();
        for(int m = 0; m < Moves::COUNT; m++){
            CubieCube moved = c;
            moved.applyMove(m);
            string expected = Facelets::applyMove(f, m);
            string got = moved.toFacelets();
            for(int k = 0; k < 54; k++) CHECK(got[k] == expected[k]);
        }
    }
    //Four quarter turns and "move then inverse" both return to the start.
    for(int m = 0; m < Moves::COUNT; m++){
        CubieCube c;
        c.applyMove(m);
        c.applyMove(Moves::inverse(m));
        CHECK(c.isSolved());
        CubieCube q;
        int quarter = (m / 3) * 3;
        for(int k = 0; k < 4; k++) q.applyMove(quarter);
        CHECK(q.isSolved());
        CHECK(Moves::parse(Moves::name(m)) == m);
    }
    CHECK(Moves::parse("X") == -1);
    CHECK(Moves::parse("R3") == -1);
    CHECK(Moves::toString(Moves::parseSequence("R U R' U'")) == "R U R' U'");
}

static void testGroupOperations(){
    Random rng(3);
    for(int i = 0; i < 1000; i++){
        CubieCube a = randomCube(rng), b = randomCube(rng);
        CHECK(a.multiply(a.inverse()).isSolved());
        CHECK(a.inverse().multiply(a).isSolved());
        //(a * b)^-1 == b^-1 * a^-1
        CHECK(a.multiply(b).inverse() == b.inverse().multiply(a.inverse()));
        //Applying a move sequence then its inverse sequence restores the cube.
        vector<int> seq;
        for(int k = 0; k < 10; k++) seq.push_back(rng.nextInt(18));
        CubieCube c = a;
        c.applyMoves(seq);
        reverse(seq.begin(), seq.end());
        for(int& m : seq) m = Moves::inverse(m);
        c.applyMoves(seq);
        CHECK(c == a);
    }
}

static void testVerifyRejectsBrokenCubes(){
    CubieCube c;
    c.co[0] = 1;
    CHECK(c.verify().find("twisted") != string::npos);
    c = CubieCube();
    c.eo[3] = 1;
    CHECK(c.verify().find("flipped") != string::npos);
    c = CubieCube();
    swap(c.cp[0], c.cp[1]);
    CHECK(c.verify().find("swapped") != string::npos);
    c = CubieCube();
    c.cp[2] = c.cp[1];
    CHECK(c.verify().find("appears") != string::npos);
    string f = Facelets::SOLVED;
    f[0] = 'R';//a U sticker misread as red
    CHECK(CubieCube::fromFacelets(f).verify() != "");
    CHECK(CubieCube::fromFacelets("tooShort").verify() != "");
    CHECK(Solver().solve(f) == "");
}

static void testCoordinates(){
    using namespace Coords;
    Coords::init();
    for(int v = 0; v < N_TWIST; v++){ CubieCube c; setTwist(c, v); CHECK(twist(c) == v); CHECK(c.verify() == ""); }
    for(int v = 0; v < N_FLIP; v++){ CubieCube c; setFlip(c, v); CHECK(flip(c) == v); CHECK(c.verify() == ""); }
    for(int v = 0; v < N_SLICE; v++){ CubieCube c; setSlice(c, v); CHECK(slice(c) == v); }
    for(int v = 0; v < N_CORNER_PERM; v++){ CubieCube c; setCornerPerm(c, v); CHECK(cornerPerm(c) == v); }
    for(int v = 0; v < N_UD_EDGE_PERM; v++){ CubieCube c; setUdEdgePerm(c, v); CHECK(udEdgePerm(c) == v); }
    for(int v = 0; v < N_SLICE_PERM; v++){ CubieCube c; setSlicePerm(c, v); CHECK(slicePerm(c) == v); }
    //The solved cube is 0 in every coordinate.
    CubieCube s;
    CHECK(twist(s) == 0 && flip(s) == 0 && slice(s) == 0);
    CHECK(cornerPerm(s) == 0 && udEdgePerm(s) == 0 && slicePerm(s) == 0);
    //Move tables agree with real moves on random cubes.
    Random rng(4);
    for(int i = 0; i < 2000; i++){
        CubieCube c = randomCube(rng);
        for(int m = 0; m < Moves::COUNT; m++){
            CubieCube moved = c;
            moved.applyMove(m);
            CHECK(twistMove[twist(c) * 18 + m] == twist(moved));
            CHECK(flipMove[flip(c) * 18 + m] == flip(moved));
            CHECK(sliceMove[slice(c) * 18 + m] == slice(moved));
            CHECK(cornerPermMove[cornerPerm(c) * 18 + m] == cornerPerm(moved));
        }
    }
    //Phase-2 tables: scramble inside G1 only.
    for(int i = 0; i < 2000; i++){
        CubieCube c;
        for(int k = 0; k < 20; k++) c.applyMove(PHASE2_MOVES[rng.nextInt(10)]);
        CHECK(twist(c) == 0 && flip(c) == 0 && slice(c) == 0);
        for(int k = 0; k < 10; k++){
            int m = PHASE2_MOVES[k];
            CubieCube moved = c;
            moved.applyMove(m);
            CHECK(udEdgePermMove[udEdgePerm(c) * 18 + m] == udEdgePerm(moved));
            CHECK(slicePermMove[slicePerm(c) * 18 + m] == slicePerm(moved));
        }
    }
}

//A pruning value must never exceed the real distance: a cube scrambled with
//n moves can be solved in n, so its heuristic is at most n.
static void testPruningIsAdmissible(){
    using namespace Coords;
    Pruning::init();
    CHECK(Pruning::sliceTwist[0] == 0);
    CHECK(Pruning::sliceFlip[0] == 0);
    CHECK(Pruning::twistFlip[0] == 0);
    CHECK(Pruning::sliceCornerPerm[0] == 0);
    CHECK(Pruning::sliceUdEdgePerm[0] == 0);
    int maxSeen[5] = {0, 0, 0, 0, 0};
    Random rng(5);
    for(int i = 0; i < 3000; i++){
        CubieCube c;
        int n = rng.nextInt(13);
        for(int k = 0; k < n; k++) c.applyMove(rng.nextInt(18));
        int a = Pruning::sliceTwist[slice(c) * N_TWIST + twist(c)];
        int b = Pruning::sliceFlip[slice(c) * N_FLIP + flip(c)];
        int d = Pruning::twistFlip[twist(c) * N_FLIP + flip(c)];
        CHECK(a <= n); CHECK(b <= n); CHECK(d <= n);
        maxSeen[0] = max(maxSeen[0], a); maxSeen[1] = max(maxSeen[1], b); maxSeen[2] = max(maxSeen[2], d);
        CubieCube g;
        int n2 = rng.nextInt(19);
        for(int k = 0; k < n2; k++) g.applyMove(PHASE2_MOVES[rng.nextInt(10)]);
        int e = Pruning::sliceCornerPerm[slicePerm(g) * N_CORNER_PERM + cornerPerm(g)];
        int f = Pruning::sliceUdEdgePerm[slicePerm(g) * N_UD_EDGE_PERM + udEdgePerm(g)];
        CHECK(e <= n2); CHECK(f <= n2);
        maxSeen[3] = max(maxSeen[3], e); maxSeen[4] = max(maxSeen[4], f);
    }
    //Every table must have been filled completely.
    for(uint8_t v : Pruning::sliceTwist) CHECK(v != 0xFF);
    for(uint8_t v : Pruning::sliceFlip) CHECK(v != 0xFF);
    for(uint8_t v : Pruning::sliceCornerPerm) CHECK(v != 0xFF);
    for(uint8_t v : Pruning::sliceUdEdgePerm) CHECK(v != 0xFF);
    cout << "  pruning depths seen: " << maxSeen[0] << " " << maxSeen[1] << " " << maxSeen[2]
         << " " << maxSeen[3] << " " << maxSeen[4] << "\n";
}

static void testWholeCubeRotations(){
    Random rng(6);
    const char axes[3] = {'x', 'y', 'z'};
    for(int i = 0; i < 300; i++){
        CubieCube c = randomCube(rng);
        string f = c.toFacelets();
        for(char axis : axes){
            //Four turns of the whole cube are the identity.
            string r = f;
            for(int k = 0; k < 4; k++) r = Facelets::rotate(r, axis);
            CHECK(r == f);
            //A rotated cube, relabelled by its centres, is still a valid cube,
            //and its solution translated back solves the original.
            string rotated = Facelets::rotate(f, axis);
            CubieCube rc = CubieCube::fromFacelets(Facelets::relabelByCentres(rotated));
            CHECK(rc.verify() == "");
            //Turning face X of the rotated cube is turning the original face
            //whose colour now sits at X's centre.
            int m = rng.nextInt(18);
            int original = (strchr(FACE_NAMES, rotated[(m / 3) * 9 + 4]) - FACE_NAMES) * 3 + m % 3;
            CubieCube a = rc;
            a.applyMove(m);
            CubieCube b = c;
            b.applyMove(original);
            string rotatedB = Facelets::relabelByCentres(Facelets::rotate(b.toFacelets(), axis));
            CHECK(a.toFacelets() == rotatedB);
        }
    }
}

static void testSolver(){
    Solver solver;
    //Kociemba's published example (README of hkociemba/RubiksCube-TwophaseSolver):
    //this cube and the 19-move solution his program prints for it, written
    //there as "L3 U1 B1 R2 F3 L1 F3 U2 L1 U3 B3 U2 B1 L2 F1 U2 R2 L2 B2 (19f)".
    //If his solution solves our parse of his string, our facelet convention
    //matches his.
    string example = "DUUBULDBFRBFRRULLLBRDFFFBLURDBFDFDRFRULBLUFDURRBLBDUDL";
    CubieCube k = CubieCube::fromFacelets(example);
    CHECK(k.verify() == "");
    CubieCube played = k;
    played.applyMoves(Moves::parseSequence("L' U B R2 F' L F' U2 L U' B' U2 B L2 F U2 R2 L2 B2"));
    CHECK(played.isSolved());
    string ours = solver.solve(k);
    CubieCube check = k;
    check.applyMoves(Moves::parseSequence(ours));
    CHECK(check.isSolved());
    CHECK(Moves::parseSequence(ours).size() <= 24);
    cout << "  Kociemba example solved in " << Moves::parseSequence(ours).size() << " moves: " << ours << "\n";

    CHECK(solver.solve(CubieCube()) == "");
    CubieCube one;
    one.applyMove(5);//R'
    CHECK(solver.solve(one) == "R");

    //Random cubes: every solution must work and respect the limits.
    Random rng(7);
    long totalFirst = 0, totalBudget = 0;
    for(int i = 0; i < 200; i++){
        CubieCube c = randomCube(rng);
        string s = solver.solve(c);
        vector<int> moves = Moves::parseSequence(s);
        CHECK(!moves.empty() && moves.size() <= 24);
        CubieCube t = c;
        t.applyMoves(moves);
        CHECK(t.isSolved());
        totalFirst += moves.size();
        //No two consecutive moves on the same face.
        for(size_t j = 1; j < moves.size(); j++) CHECK(moves[j] / 3 != moves[j - 1] / 3);
        if(i < 50){
            string better = solver.solve(c, 24, 0, 30);
            vector<int> bm = Moves::parseSequence(better);
            CHECK(bm.size() <= moves.size());
            CubieCube t2 = c;
            t2.applyMoves(bm);
            CHECK(t2.isSolved());
            totalBudget += bm.size();
        }
    }
    cout << "  200 random cubes: first solution averages " << totalFirst / 200.0
         << " moves; with a 30 ms budget (first 50) " << totalBudget / 50.0 << "\n";
    //Facelet entry point and the stop length.
    CubieCube c = randomCube(rng);
    string s = solver.solve(c.toFacelets(), 24, 21, 0);
    CHECK(Moves::parseSequence(s).size() <= 21);
    //Seeded random cubes are reproducible.
    Random r1(99), r2(99);
    CHECK(randomCube(r1) == randomCube(r2));
}

int main(){
    cout << "facelet round trip\n"; testFaceletRoundTrip();
    cout << "moves against geometry\n"; testMovesAgainstGeometry();
    cout << "group operations\n"; testGroupOperations();
    cout << "verify\n"; testVerifyRejectsBrokenCubes();
    cout << "coordinates and move tables\n"; testCoordinates();
    cout << "pruning tables\n"; testPruningIsAdmissible();
    cout << "whole-cube rotations\n"; testWholeCubeRotations();
    cout << "solver\n"; testSolver();
    cout << checks << " checks, " << failures << " failures\n";
    return failures == 0 ? 0 : 1;
}
