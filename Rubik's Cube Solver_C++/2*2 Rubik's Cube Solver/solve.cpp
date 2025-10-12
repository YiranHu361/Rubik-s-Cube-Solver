#include "Cube.h"
#include "Side.h"
#include <iostream>

using namespace std;

Cube scramble(){
    Side s[6];
    for(int i = 0; i < 6; i++){
        int b[4];
        for(int j = 0; j < 4; j++){
            cin>>b[j];
        }
        s[i].setSide(b);
    }
    Cube c;
    c.setCube(s);
    return c;
}

int main(){
    Side s[6];
    for(int i = 0; i < 6; i++){
        int b[4];
        for(int j = 0; j < 4; j++){
            b[j]=i;
        }
        s[i].setSide(b);
    }
    Cube c;
    c.setCube(s);
    cout<<c.solve(scramble())<<'\n';
    return 0;
}