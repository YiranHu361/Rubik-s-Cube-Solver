//Command line front end for the two-phase solver.
//
//  cube3 solve <facelets> [--max N] [--stop N] [--time MS]
//      Solve one cube given as a 54-character facelet string (U R F D L B faces).
//  cube3 scramble [--seed S]
//      Print a random cube: its facelets and a scramble sequence that produces it.
//  cube3 bench [COUNT] [--time MS] [--seed S]
//      Solve COUNT random cubes and report average length and time.
//  cube3 vectors [COUNT] [--stop N] [--seed S]
//      Print "facelets solution" lines, used to cross-check the JavaScript port.
#include "Solver.h"
#include <iostream>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <chrono>
#include <map>
#include <algorithm>

using namespace std;

//Reads "--name value" options from the arguments; everything else is positional.
struct Args{
    vector<string> positional;
    map<string, string> options;
    Args(int argc, char** argv){
        for(int i = 2; i < argc; i++){
            string a = argv[i];
            if(a.rfind("--", 0) == 0 && i + 1 < argc){
                options[a.substr(2)] = argv[++i];
            }else{
                positional.push_back(a);
            }
        }
    }
    int get(const string& name, int fallback) const{
        auto it = options.find(name);
        return it == options.end() ? fallback : atoi(it->second.c_str());
    }
};

static double millisecondsSince(chrono::steady_clock::time_point start){
    return chrono::duration<double, milli>(chrono::steady_clock::now() - start).count();
}

static int usage(){
    cerr << "usage:\n"
         << "  cube3 solve <facelets> [--max N] [--stop N] [--time MS]\n"
         << "  cube3 scramble [--seed S]\n"
         << "  cube3 bench [COUNT] [--time MS] [--seed S]\n"
         << "  cube3 vectors [COUNT] [--stop N] [--seed S]\n";
    return 1;
}

int main(int argc, char** argv){
    if(argc < 2) return usage();
    string command = argv[1];
    Args args(argc, argv);

    if(command == "solve"){
        if(args.positional.empty()) return usage();
        string facelets = args.positional[0];
        CubieCube cube = CubieCube::fromFacelets(facelets);
        string problem = cube.verify();
        if(problem != ""){
            cerr << "invalid cube: " << problem << "\n";
            return 2;
        }
        auto start = chrono::steady_clock::now();
        Solver solver;
        double initMs = millisecondsSince(start);
        start = chrono::steady_clock::now();
        int maxLength = args.get("max", 24);
        string solution = solver.solve(cube, maxLength, args.get("stop", maxLength), args.get("time", 0));
        double solveMs = millisecondsSince(start);
        CubieCube check = cube;
        check.applyMoves(Moves::parseSequence(solution));
        cout << solution << "\n";
        cout << "moves: " << Moves::parseSequence(solution).size()
             << "  solved: " << (check.isSolved() ? "yes" : "NO")
             << "  tables: " << fixed << setprecision(0) << initMs << " ms"
             << "  search: " << setprecision(2) << solveMs << " ms\n";
        return 0;
    }

    if(command == "scramble"){
        Random rng(args.get("seed", (int)time(nullptr)));
        CubieCube cube = CubieCube::random(rng);
        Solver solver;
        //The inverse of a solution, played forwards, is a scramble for the cube.
        vector<int> solution = Moves::parseSequence(solver.solve(cube, 24, 0, 200));
        reverse(solution.begin(), solution.end());
        for(int& m : solution) m = Moves::inverse(m);
        cout << cube.toFacelets() << "\n";
        cout << "scramble from solved: " << Moves::toString(solution) << "\n";
        return 0;
    }

    if(command == "bench"){
        int count = args.positional.empty() ? 1000 : atoi(args.positional[0].c_str());
        int timeMs = args.get("time", 0);
        Random rng(args.get("seed", 12345));
        auto start = chrono::steady_clock::now();
        Solver solver;
        cout << "tables built in " << fixed << setprecision(0) << millisecondsSince(start) << " ms\n";
        double totalMs = 0, maxMs = 0;
        long long totalMoves = 0;
        int maxMoves = 0, failures = 0;
        map<int, int> histogram;
        for(int i = 0; i < count; i++){
            CubieCube cube = CubieCube::random(rng);
            start = chrono::steady_clock::now();
            string solution = timeMs > 0 ? solver.solve(cube, 24, 0, timeMs) : solver.solve(cube);
            double ms = millisecondsSince(start);
            vector<int> moves = Moves::parseSequence(solution);
            CubieCube check = cube;
            check.applyMoves(moves);
            if(!check.isSolved() || solution.empty()) failures++;
            totalMs += ms;
            maxMs = max(maxMs, ms);
            totalMoves += moves.size();
            maxMoves = max(maxMoves, (int)moves.size());
            histogram[moves.size()]++;
        }
        cout << "cubes: " << count << (timeMs > 0 ? "  (time budget " + to_string(timeMs) + " ms each)" : "  (first solution)") << "\n";
        cout << "average length: " << setprecision(2) << (double)totalMoves / count << " moves, longest " << maxMoves << "\n";
        cout << "average time: " << setprecision(3) << totalMs / count << " ms, slowest " << maxMs << " ms\n";
        cout << "unsolved: " << failures << "\n";
        cout << "length histogram:";
        for(auto& kv : histogram) cout << " " << kv.first << ":" << kv.second;
        cout << "\n";
        return failures == 0 ? 0 : 1;
    }

    if(command == "vectors"){
        int count = args.positional.empty() ? 100 : atoi(args.positional[0].c_str());
        int stop = args.get("stop", 24);
        Random rng(args.get("seed", 777));
        Solver solver;
        for(int i = 0; i < count; i++){
            CubieCube cube = CubieCube::random(rng);
            cout << cube.toFacelets() << " " << solver.solve(cube, 24, stop, 0) << "\n";
        }
        return 0;
    }

    return usage();
}
