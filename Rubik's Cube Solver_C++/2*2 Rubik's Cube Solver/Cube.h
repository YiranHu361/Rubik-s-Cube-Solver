#ifndef CUBE_H
#define CUBE_H
#include "Side.h"
#include <iostream>
#include <string>
#include <queue>
#include <utility>
#include <map>
using namespace std;

//0 is yellow
//1 is green
//2 is red
//3 is blue
//4 is orange
//5 is white

class Cube{
    public:
        map<string, string> m;
        map<string, bool> vis;
        Side cube[6];
        int steps;
        void setCube(Side s[6]);
        void R();
        void L();
        void D();
        void U();
        void F();
        void B();
        void solveOriginal();
        string solve(Cube c);
        string hash(Cube c);
        Cube clone();
        void printCube();


};

void Cube::printCube(){
    for(int i = 0; i < 6; i++){
        for(int j = 0; j < 4; j++){
            cout << cube[i].blocks[j] << " ";
            if(j == 1) cout << "\n";
        }
        cout << "\n";
    }
}

string Cube::hash(Cube c){
    string str="";
    for(int j=0;j<6;j++){
        for(int i=0;i<4;i++){
            str+=to_string(c.cube[j].blocks[i]);
        }
    }
    return str;
}

Cube Cube::clone(){
    Cube c;
    for(int i = 0; i < 6; i++){ 
        for(int j = 0; j < 4; j++){
            c.cube[i].blocks[j] = cube[i].blocks[j];
        }
    }
    return c;
}

string Cube::solve(Cube c){
    solveOriginal();
    queue<pair<Cube, string> > q;
    c.steps=0;
    q.push(make_pair(c, ""));
    while(!q.empty()){
        Cube c = q.front().first;
        string s = q.front().second;
        q.pop();
        string sum=hash(c);
        if(vis[sum]) continue;
        vis[sum]=true;
        if(m[sum].length()){
            return s+m[sum];
        }
        c.steps++;
        c.R();
        q.push(make_pair(c, s+"R"));
        c.R();
        c.R();
        q.push(make_pair(c, s+"R'"));
        c.R();
        c.L();
        q.push(make_pair(c, s+"L"));
        c.L();
        c.L();
        q.push(make_pair(c, s+"L'"));
        c.L();
        c.D();
        q.push(make_pair(c, s+"D"));
        c.D();
        c.D();
        q.push(make_pair(c, s+"D'"));
        c.D();
        c.U();
        q.push(make_pair(c, s+"U"));
        c.U();
        c.U();
        q.push(make_pair(c, s+"U'"));
        c.U();
        c.F();
        q.push(make_pair(c, s+"F"));
        c.F();
        c.F();
        q.push(make_pair(c, s+"F'"));
        c.F();
        c.B();
        q.push(make_pair(c, s+"B"));
        c.B();
        c.B();
        q.push(make_pair(c, s+"B'"));
        c.B();
    }
    return "No solution";
}

void Cube::solveOriginal(){
    queue<pair<Cube, string> > q;
    this->steps=0;
    q.push(make_pair(*this, ""));
    while(!q.empty()){
        Cube c = q.front().first;
        string s = q.front().second;
        q.pop();
        string sum=hash(c);
        if(!m[sum].length()){
            m[sum]=s;
        }else{
            continue;
        }
        if(c.steps>6){
            break;
        }
        c.steps++;
        c.R();
        q.push(make_pair(c, "R'"+s));
        c.R();
        c.R();
        q.push(make_pair(c, "R"+s));
        c.R();
        c.L();
        q.push(make_pair(c, "L'"+s));
        c.L();
        c.L();
        q.push(make_pair(c, "L"+s));
        c.L();
        c.D();
        q.push(make_pair(c, "D'"+s));
        c.D();
        c.D();
        q.push(make_pair(c, "D"+s));
        c.D();
        c.U();
        q.push(make_pair(c, "U'"+s));
        c.U();
        c.U();
        q.push(make_pair(c, "U"+s));
        c.U();
        c.F();
        q.push(make_pair(c, "F'"+s));
        c.F();
        c.F();
        q.push(make_pair(c, "F"+s));
        c.F();
        c.B();
        q.push(make_pair(c, "B'"+s));
        c.B();
        c.B();
        q.push(make_pair(c, "B"+s));
        c.B();
    }

        
}

void Cube::setCube(Side *s){
    for(int i = 0; i < 6; i++){ 
        for(int j = 0; j < 4; j++){
            cube[i].blocks[j] = s[i].blocks[j];
        }
    }
}

void Cube::R(){
    int temp1=cube[4].blocks[0];
    cube[4].blocks[0]=cube[4].blocks[2];
    cube[4].blocks[2]=cube[4].blocks[3];
    cube[4].blocks[3]=cube[4].blocks[1];
    cube[4].blocks[1]=temp1;
    temp1=cube[0].blocks[3];
    cube[0].blocks[3]=cube[1].blocks[3];
    cube[1].blocks[3]=cube[5].blocks[3];
    cube[5].blocks[3]=cube[3].blocks[0];
    cube[3].blocks[0]=temp1;
    temp1=cube[0].blocks[1];
    cube[0].blocks[1]=cube[1].blocks[1];
    cube[1].blocks[1]=cube[5].blocks[1];
    cube[5].blocks[1]=cube[3].blocks[2];
    cube[3].blocks[2]=temp1;
}

void Cube::L(){
    int temp1=cube[2].blocks[0];
    cube[2].blocks[0]=cube[2].blocks[2];
    cube[2].blocks[2]=cube[2].blocks[3];
    cube[2].blocks[3]=cube[2].blocks[1];
    cube[2].blocks[1]=temp1;
    temp1=cube[0].blocks[0];
    cube[0].blocks[0]=cube[3].blocks[3];
    cube[3].blocks[3]=cube[5].blocks[0];
    cube[5].blocks[0]=cube[1].blocks[0];
    cube[1].blocks[0]=temp1;
    temp1=cube[0].blocks[2];
    cube[0].blocks[2]=cube[3].blocks[1];
    cube[3].blocks[1]=cube[5].blocks[2];
    cube[5].blocks[2]=cube[1].blocks[2];
    cube[1].blocks[2]=temp1;
}

void Cube::D(){
    int temp1=cube[5].blocks[0];
    cube[5].blocks[0]=cube[5].blocks[2];
    cube[5].blocks[2]=cube[5].blocks[3];
    cube[5].blocks[3]=cube[5].blocks[1];
    cube[5].blocks[1]=temp1;
    temp1=cube[1].blocks[2];
    cube[1].blocks[2]=cube[2].blocks[2];
    cube[2].blocks[2]=cube[3].blocks[2];
    cube[3].blocks[2]=cube[4].blocks[2];
    cube[4].blocks[2]=temp1;
    temp1=cube[1].blocks[3];
    cube[1].blocks[3]=cube[2].blocks[3];  
    cube[2].blocks[3]=cube[3].blocks[3];
    cube[3].blocks[3]=cube[4].blocks[3];
    cube[4].blocks[3]=temp1;
}

void Cube::U(){
    int temp1=cube[0].blocks[0];
    cube[0].blocks[0]=cube[0].blocks[2];
    cube[0].blocks[2]=cube[0].blocks[3];
    cube[0].blocks[3]=cube[0].blocks[1];
    cube[0].blocks[1]=temp1;
    temp1=cube[1].blocks[0];
    cube[1].blocks[0]=cube[4].blocks[0];
    cube[4].blocks[0]=cube[3].blocks[0];
    cube[3].blocks[0]=cube[2].blocks[0];
    cube[2].blocks[0]=temp1;
    temp1=cube[1].blocks[1];
    cube[1].blocks[1]=cube[4].blocks[1];
    cube[4].blocks[1]=cube[3].blocks[1];
    cube[3].blocks[1]=cube[2].blocks[1];
    cube[2].blocks[1]=temp1;
}

void Cube::B(){
    int temp1=cube[3].blocks[0];
    cube[3].blocks[0]=cube[3].blocks[2];
    cube[3].blocks[2]=cube[3].blocks[3];
    cube[3].blocks[3]=cube[3].blocks[1];
    cube[3].blocks[1]=temp1;
    temp1=cube[0].blocks[0];
    cube[0].blocks[0]=cube[4].blocks[1];
    cube[4].blocks[1]=cube[5].blocks[3];
    cube[5].blocks[3]=cube[2].blocks[2];
    cube[2].blocks[2]=temp1;
    temp1=cube[0].blocks[1];
    cube[0].blocks[1]=cube[4].blocks[3];
    cube[4].blocks[3]=cube[5].blocks[2];
    cube[5].blocks[2]=cube[2].blocks[0];
    cube[2].blocks[0]=temp1;
}

void Cube::F(){
    int temp1=cube[1].blocks[0];
    cube[1].blocks[0]=cube[1].blocks[2];
    cube[1].blocks[2]=cube[1].blocks[3];
    cube[1].blocks[3]=cube[1].blocks[1];
    cube[1].blocks[1]=temp1;
    temp1=cube[0].blocks[2];
    cube[0].blocks[2]=cube[2].blocks[3];
    cube[2].blocks[3]=cube[5].blocks[1];
    cube[5].blocks[1]=cube[4].blocks[0];
    cube[4].blocks[0]=temp1;
    temp1=cube[0].blocks[3];
    cube[0].blocks[3]=cube[2].blocks[1];
    cube[2].blocks[1]=cube[5].blocks[0];
    cube[5].blocks[0]=cube[4].blocks[2];
    cube[4].blocks[2]=temp1;
}

#endif
