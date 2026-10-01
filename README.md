# Rubik's Cube solvers

Two solvers written in C++, from a brute-force 2x2 to a full 3x3 two-phase solver with a browser front end.

| folder | what it is |
|--------|------------|
| `Rubik's Cube Solver_C++/2*2 Rubik's Cube Solver` | 2x2x2 solver: breadth-first search with hashing over the whole state space. |
| `Rubik's Cube Solver_C++/3-layers` | an early breadth-first attempt at the 3x3 (kept for history; the state space is far too large for it). |
| `Rubik's Cube Solver_C++/3x3-two-phase` | 3x3x3 solver using Kociemba's two-phase algorithm, with unit tests, benchmarks, a JavaScript port and a web app that reads a cube from two corner photos. See its README. |

The 3x3 solver finds solutions of about 20 moves in a few milliseconds (first solution), or about 19 moves when given 100 ms to keep improving.
