const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const avatars = ['🐱', '🐶', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸', '🐵', '🐰'];

let players = [];
let currentRound = 1;
let prevAlivePlayers = [];
let roundTimer = null;
let timeLeft = 5;

function getAvatar(index) {
    return avatars[index % avatars.length];
}

io.on('connection', (socket) => {
    // 신규 접속자(관리자 포함)가 올 때 현재 상태 즉시 전송
    socket.emit('updatePlayers', { players, round: currentRound });

    socket.on('join', (nickname) => {
        let playerIndex = players.length;
        let newPlayer = {
            id: socket.id,
            nickname: nickname,
            avatar: getAvatar(playerIndex),
            isAlive: true,
            choice: null,
            chat: ""
        };
        players.push(newPlayer);
        
        // 전체에 즉시 업데이트 알림
        io.emit('updatePlayers', { players, round: currentRound });
    });

    socket.on('makeChoice', (choice) => {
        let player = players.find(p => p.id === socket.id);
        if (player && player.isAlive) {
            player.choice = choice;
            io.emit('updatePlayers', { players, round: currentRound });
        }
    });

    socket.on('sendChat', (msg) => {
        let player = players.find(p => p.id === socket.id);
        if (player) {
            player.chat = msg;
            io.emit('updatePlayers', { players, round: currentRound });

            setTimeout(() => {
                player.chat = "";
                io.emit('updatePlayers', { players, round: currentRound });
            }, 4000);
        }
    });

    socket.on('startRound', () => {
        if (roundTimer) clearInterval(roundTimer);

        prevAlivePlayers = players.filter(p => p.isAlive).map(p => p.id);
        players.forEach(p => p.choice = null);
        timeLeft = 5;

        io.emit('roundStarted', { round: currentRound, timeLeft });
        io.emit('updatePlayers', { players, round: currentRound });

        roundTimer = setInterval(() => {
            timeLeft -= 1;
            io.emit('timerUpdate', { timeLeft });

            if (timeLeft <= 0) {
                clearInterval(roundTimer);
            }
        }, 1000);
    });

    socket.on('showResult', (aiChoice) => {
        if (roundTimer) clearInterval(roundTimer);

        let activePlayers = players.filter(p => p.isAlive);

        activePlayers.forEach(p => {
            if (!p.choice) {
                p.choice = '미제출';
                p.isAlive = false;
            } else {
                let userChoice = p.choice;
                let isWin = (
                    (userChoice === '가위' && aiChoice === '보') ||
                    (userChoice === '바위' && aiChoice === '가위') ||
                    (userChoice === '보' && aiChoice === '바위')
                );

                if (!isWin) {
                    p.isAlive = false;
                }
            }
        });

        let currentAlive = players.filter(p => p.isAlive);
        let isRevived = false;

        if (activePlayers.length > 0 && currentAlive.length === 0) {
            players.forEach(p => {
                if (prevAlivePlayers.includes(p.id)) {
                    p.isAlive = true;
                }
            });
            isRevived = true;
        }

        let remainingAlive = players.filter(p => p.isAlive);
        let isWinnerFound = (remainingAlive.length === 1 && players.length > 1);

        if (!isWinnerFound) {
            currentRound++;
        }

        io.emit('roundResult', {
            aiChoice,
            players,
            round: currentRound,
            isWinnerFound,
            isRevived
        });
    });

    socket.on('resetGame', () => {
        if (roundTimer) clearInterval(roundTimer);
        currentRound = 1;
        players.forEach(p => {
            p.isAlive = true;
            p.choice = null;
            p.chat = "";
        });
        io.emit('gameReset', { players, round: currentRound });
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', { players, round: currentRound });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 서버 실행 중: 포트 ${PORT}`);
});
