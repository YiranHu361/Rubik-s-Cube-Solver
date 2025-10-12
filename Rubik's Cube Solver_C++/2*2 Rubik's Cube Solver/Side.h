#ifndef SIDE_H
#define SIDE_H
#include <iostream>
using namespace std;

//a way to represent each block in a side of a rubik's cube
class Side{
    public :
        int blocks[4];
        void setSide(int b[4]){
            for(int i = 0; i < 4; i++){
                blocks[i] = b[i];
            }
        }
        
};


#endif