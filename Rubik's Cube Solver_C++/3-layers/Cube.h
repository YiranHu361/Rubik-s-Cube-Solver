#ifndef CUBE_H
#define CUBE_H
#include "Side.h"
#include <iostream>
#include <string>
#include <queue>
#include <utility>
#include <unordered_map>
using namespace std;

//0 is yellow
//1 is green
//2 is red
//3 is blue
//4 is orange
//5 is white

class Cube{
    public:
        unordered_map<long long, string> m;
        Side cube[6];
        //set the cube to a state
        void setCube(Side s[6]);
        //rotate Right side
        void R();
        void L();
        void D();
        void U();
        void F();
        void B();
        void solve();
        long long hash(Cube c);
        Cube clone();



};

Cube Cube::clone(){
    Cube c;
    for(int i = 0; i < 6; i++){ 
        for(int j = 0; j < 9; j++){
            c.cube[i].blocks[j] = cube[i].blocks[j];
        }
    }
    return c;
}

long long Cube::hash(Cube c){
    long long prime[9]={1543,29,769,97,389,193,6151,53,3079};
    long long sum=0;
    for(int j=0;j<6;j++){
        long long sum2=0;
        for(int i=0;i<9;i++){
            sum2+=c.cube[j].blocks[i]*prime[i];
        }
        sum+=sum2*prime[j];
    }
    return sum;
}

void Cube::solve(){
    queue<pair<Cube, string> > q;
    q.push(make_pair(*this, "S"));
    while(!q.empty()){
        Cube c = q.front().first;
        string s = q.front().second;
        q.pop();
        long long sum=hash(c);
        if(!m[sum].length()){
            cout<< sum << " " << s << '\n';
            m[sum]=s;
        }else{
            continue;
        }
        if(s.length()>9){
            continue;
        }
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

        
}

void Cube::setCube(Side *s){
    for(int i = 0; i < 6; i++){ 
        for(int j = 0; j < 9; j++){
            cube[i].blocks[j] = s[i].blocks[j];
        }
    }
}

void Cube::R(){
    int temp1=cube[0].blocks[2],temp2=cube[0].blocks[5],temp3=cube[0].blocks[8];
    cube[0].blocks[2]=cube[1].blocks[2];
    cube[0].blocks[5]=cube[1].blocks[5];
    cube[0].blocks[8]=cube[1].blocks[8];
    cube[1].blocks[2]=cube[5].blocks[2];
    cube[1].blocks[5]=cube[5].blocks[5];
    cube[1].blocks[8]=cube[5].blocks[8];
    cube[5].blocks[2]=cube[3].blocks[6];
    cube[5].blocks[5]=cube[3].blocks[3];
    cube[5].blocks[8]=cube[3].blocks[0];
    cube[3].blocks[6]=temp1;
    cube[3].blocks[3]=temp2;
    cube[3].blocks[0]=temp3;
    temp1=cube[4].blocks[0];
    cube[4].blocks[0]=cube[4].blocks[6];
    cube[4].blocks[6]=cube[4].blocks[8];
    cube[4].blocks[8]=cube[4].blocks[2];
    cube[4].blocks[2]=temp1;
    temp1=cube[4].blocks[1];
    cube[4].blocks[1]=cube[4].blocks[3];
    cube[4].blocks[3]=cube[4].blocks[7];
    cube[4].blocks[7]=cube[4].blocks[5];
    cube[4].blocks[5]=temp1;
}

void Cube::L(){
    int temp1=cube[0].blocks[0],temp2=cube[0].blocks[3],temp3=cube[0].blocks[6];
    cube[0].blocks[0]=cube[3].blocks[8];
    cube[0].blocks[3]=cube[3].blocks[5];
    cube[0].blocks[6]=cube[3].blocks[2];
    cube[3].blocks[8]=cube[5].blocks[0];
    cube[3].blocks[5]=cube[5].blocks[3];
    cube[3].blocks[2]=cube[5].blocks[6];
    cube[5].blocks[0]=cube[1].blocks[0];
    cube[5].blocks[3]=cube[1].blocks[3];
    cube[5].blocks[6]=cube[1].blocks[6];
    cube[1].blocks[0]=temp1;
    cube[1].blocks[3]=temp2;
    cube[1].blocks[6]=temp3;
    temp1=cube[2].blocks[0];
    cube[2].blocks[0]=cube[2].blocks[6];
    cube[2].blocks[6]=cube[2].blocks[8];
    cube[2].blocks[8]=cube[2].blocks[2];
    cube[2].blocks[2]=temp1;
    temp1=cube[2].blocks[1];
    cube[2].blocks[1]=cube[2].blocks[3];
    cube[2].blocks[3]=cube[2].blocks[7];
    cube[2].blocks[7]=cube[2].blocks[5];
    cube[2].blocks[5]=temp1;
}

void Cube::D(){
    int temp1=cube[1].blocks[6],temp2=cube[1].blocks[7],temp3=cube[1].blocks[8];
    cube[1].blocks[6]=cube[4].blocks[6];
    cube[1].blocks[7]=cube[4].blocks[7];
    cube[1].blocks[8]=cube[4].blocks[8];
    cube[4].blocks[6]=cube[3].blocks[6];
    cube[4].blocks[7]=cube[3].blocks[7];
    cube[4].blocks[8]=cube[3].blocks[8];
    cube[3].blocks[6]=cube[2].blocks[6];
    cube[3].blocks[7]=cube[2].blocks[7];
    cube[3].blocks[8]=cube[2].blocks[8];
    cube[2].blocks[6]=temp1;
    cube[2].blocks[7]=temp2;
    cube[2].blocks[8]=temp3;
    temp1=cube[5].blocks[0];
    cube[5].blocks[0]=cube[5].blocks[2];
    cube[5].blocks[2]=cube[5].blocks[8];
    cube[5].blocks[8]=cube[5].blocks[6];
    cube[5].blocks[6]=temp1;
    temp1=cube[5].blocks[1];
    cube[5].blocks[1]=cube[5].blocks[5];
    cube[5].blocks[5]=cube[5].blocks[7];
    cube[5].blocks[7]=cube[5].blocks[3];
    cube[5].blocks[3]=temp1;
}

void Cube::U(){
    int temp1=cube[1].blocks[0],temp2=cube[1].blocks[1],temp3=cube[1].blocks[2];
    cube[1].blocks[0]=cube[2].blocks[0];
    cube[1].blocks[1]=cube[2].blocks[1];
    cube[1].blocks[2]=cube[2].blocks[2];
    cube[2].blocks[0]=cube[3].blocks[0];
    cube[2].blocks[1]=cube[3].blocks[1];
    cube[2].blocks[2]=cube[3].blocks[2];
    cube[3].blocks[0]=cube[4].blocks[0];
    cube[3].blocks[1]=cube[4].blocks[1];
    cube[3].blocks[2]=cube[4].blocks[2];
    cube[4].blocks[0]=temp1;
    cube[4].blocks[1]=temp2;
    cube[4].blocks[2]=temp3;
    temp1=cube[0].blocks[0];
    cube[0].blocks[0]=cube[0].blocks[2];
    cube[0].blocks[2]=cube[0].blocks[8];
    cube[0].blocks[8]=cube[0].blocks[6];
    cube[0].blocks[6]=temp1;
    temp1=cube[0].blocks[1];
    cube[0].blocks[1]=cube[0].blocks[5];
    cube[0].blocks[5]=cube[0].blocks[7];
    cube[0].blocks[7]=cube[0].blocks[3];
    cube[0].blocks[3]=temp1;
}

void Cube::B(){
    int temp1=cube[0].blocks[0],temp2=cube[0].blocks[1],temp3=cube[0].blocks[2];
    cube[0].blocks[0]=cube[4].blocks[2];
    cube[0].blocks[1]=cube[4].blocks[5];
    cube[0].blocks[2]=cube[4].blocks[8];
    cube[4].blocks[2]=cube[5].blocks[8];
    cube[4].blocks[5]=cube[5].blocks[7];
    cube[4].blocks[8]=cube[5].blocks[6];
    cube[5].blocks[8]=cube[2].blocks[6];
    cube[5].blocks[7]=cube[2].blocks[3];
    cube[5].blocks[6]=cube[2].blocks[0];
    cube[2].blocks[6]=temp1;
    cube[2].blocks[3]=temp2;
    cube[2].blocks[0]=temp3;
    temp1=cube[3].blocks[0];
    cube[3].blocks[0]=cube[3].blocks[6];
    cube[3].blocks[6]=cube[3].blocks[8];
    cube[3].blocks[8]=cube[3].blocks[2];
    cube[3].blocks[2]=temp1;
    temp1=cube[3].blocks[1];
    cube[3].blocks[1]=cube[3].blocks[3];
    cube[3].blocks[3]=cube[3].blocks[7];
    cube[3].blocks[7]=cube[3].blocks[5];
    cube[3].blocks[5]=temp1;
}

void Cube::F(){
    int temp1=cube[0].blocks[6],temp2=cube[0].blocks[7],temp3=cube[0].blocks[8];
    cube[0].blocks[6]=cube[2].blocks[8];
    cube[0].blocks[7]=cube[2].blocks[5];
    cube[0].blocks[8]=cube[2].blocks[2];
    cube[2].blocks[8]=cube[5].blocks[2];
    cube[2].blocks[5]=cube[5].blocks[1];
    cube[2].blocks[2]=cube[5].blocks[0];
    cube[5].blocks[2]=cube[4].blocks[0];
    cube[5].blocks[1]=cube[4].blocks[3];
    cube[5].blocks[0]=cube[4].blocks[6];
    cube[4].blocks[0]=temp1;
    cube[4].blocks[3]=temp2;
    cube[4].blocks[6]=temp3;
    temp1=cube[1].blocks[0];
    cube[1].blocks[0]=cube[1].blocks[6];
    cube[1].blocks[6]=cube[1].blocks[8];
    cube[1].blocks[8]=cube[1].blocks[2];
    cube[1].blocks[2]=temp1;
    temp1=cube[1].blocks[1];
    cube[1].blocks[1]=cube[1].blocks[3];
    cube[1].blocks[3]=cube[1].blocks[7];
    cube[1].blocks[7]=cube[1].blocks[5];
    cube[1].blocks[5]=temp1;
}

#endif
