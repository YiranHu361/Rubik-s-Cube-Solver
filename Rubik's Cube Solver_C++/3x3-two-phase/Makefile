#Build from inside this folder:  make        -> bin/cube3
#                                make test   -> builds and runs bin/tests
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra
SRC = src/Cube.cpp src/Coords.cpp src/Pruning.cpp src/Solver.cpp
HEADERS = src/Cube.h src/Coords.h src/Pruning.h src/Solver.h

all: bin/cube3

bin/cube3: $(SRC) src/main.cpp $(HEADERS)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) -o $@ $(SRC) src/main.cpp

bin/tests: $(SRC) tests/tests.cpp $(HEADERS)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) -Isrc -o $@ $(SRC) tests/tests.cpp

test: bin/tests
	./bin/tests

bench: bin/cube3
	./bin/cube3 bench 1000
	./bin/cube3 bench 1000 --time 100

clean:
	rm -rf bin

.PHONY: all test bench clean
