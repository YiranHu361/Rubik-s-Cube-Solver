#include "Cube.h"
#include "Side.h"
#include <iostream>


using namespace std;

int main(){
    freopen("lookup.txt","w", stdout);
    Side s[6];
    for(int i = 0; i < 6; i++){
        int b[9];
        for(int j = 0; j < 9; j++){
            b[j]=i;
        }
        s[i].setSide(b);
    }
    Cube c;
    Cube c2;c2.setCube(s);
    c.setCube(s);
    c.L();
    c.D();
    c.R();
    c.B();
    c.F();
    c.solve();
    cout << c.m[c.hash(c2)] << '\n';
    cout << c.m.size() << '\n';
    return 0;
}