const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // Render 환경에서 정적 파일 경로 오류 방지

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// 관리자 페이지 경로 (path.join 사용으로 Render/Linux 환경 완벽 대응)
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
    socket.on('join', (nickname) => {
        let playerIndex = players.length;
        players.push({
            id: socket.id,
            nickname: nickname,
            avatar: getAvatar(playerIndex),
            isAlive: true,
            choice: null,
            chat: ""
        });
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

        // 이전 라운드 생존자 백업 (전원 탈락 대비 패자부활용)
        prevAlivePlayers = players.filter(p => p.isAlive).map(p => p.id);

        players.forEach(p => p.choice = null);
        timeLeft = 5;

        io.emit('roundStarted', { round: currentRound, timeLeft });
        io.emit('updatePlayers', { players, round: currentRound });

        // 5초 타이머 시작
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
                // 5초 내 미제출자 탈락
                p.choice = '미제출';
                p.isAlive = false;
            } else {
                let userChoice = p.choice;
                
                // AI를 무조건 이긴 경우에만 생존 (가위>보, 바위>가위, 보>바위)
                let isWin = (
                    (userChoice === '가위' && aiChoice === '보') ||
                    (userChoice === '바위' && aiChoice === '가위') ||
                    (userChoice === '보' && aiChoice === '바위')
                );

                // 지거나 비긴 경우는 모두 탈락
                if (!isWin) {
                    p.isAlive = false;
                }
            }
        });

        let currentAlive = players.filter(p => p.isAlive);
        let isRevived = false;

        // 전원 탈락 시 자동 패자부활
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

// Render 등 클라우드 포트 자동 감지
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 서버 실행 중: 포트 ${PORT}`);
});
