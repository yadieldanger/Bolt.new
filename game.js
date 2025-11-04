// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let gameRunning = false;
let gamePaused = false;
let animationId = null;

// Score
let playerScore = 0;
let cpuScore = 0;
const WINNING_SCORE = 10;

// Paddle properties
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 6;

// Player paddle
const player = {
    x: 10,
    y: canvas.height / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    dy: 0
};

// CPU paddle
const cpu = {
    x: canvas.width - PADDLE_WIDTH - 10,
    y: canvas.height / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    speed: 4
};

// Ball properties
const BALL_SIZE = 10;
const INITIAL_BALL_SPEED = 5;

const ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: BALL_SIZE / 2,
    dx: INITIAL_BALL_SPEED,
    dy: INITIAL_BALL_SPEED,
    speed: INITIAL_BALL_SPEED
};

// Keyboard state
const keys = {
    w: false,
    s: false,
    ArrowUp: false,
    ArrowDown: false
};

// Event listeners for controls
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('resetBtn').addEventListener('click', resetGame);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.key in keys) {
        keys[e.key] = true;
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key in keys) {
        keys[e.key] = false;
        e.preventDefault();
    }
});

// Draw functions
function drawRect(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
}

function drawCircle(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawNet() {
    const netWidth = 2;
    const netHeight = 10;
    const gap = 15;
    ctx.fillStyle = '#444';

    for (let i = 0; i < canvas.height; i += netHeight + gap) {
        drawRect(canvas.width / 2 - netWidth / 2, i, netWidth, netHeight, '#444');
    }
}

function drawPaddle(paddle) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

    // Add gradient effect
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

function drawBall() {
    // Draw glow effect
    const gradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.radius * 2);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.5, '#667eea');
    gradient.addColorStop(1, 'rgba(102, 126, 234, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw ball
    drawCircle(ball.x, ball.y, ball.radius, '#fff');
}

function draw() {
    // Clear canvas
    drawRect(0, 0, canvas.width, canvas.height, '#1a1a2e');

    // Draw net
    drawNet();

    // Draw paddles
    drawPaddle(player);
    drawPaddle(cpu);

    // Draw ball
    drawBall();
}

// Game logic
function movePaddles() {
    // Player movement
    if (keys.w || keys.ArrowUp) {
        player.dy = -PADDLE_SPEED;
    } else if (keys.s || keys.ArrowDown) {
        player.dy = PADDLE_SPEED;
    } else {
        player.dy = 0;
    }

    player.y += player.dy;

    // Keep player paddle within bounds
    if (player.y < 0) player.y = 0;
    if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
    }

    // CPU AI - follows the ball with some delay
    const cpuCenter = cpu.y + cpu.height / 2;
    if (cpuCenter < ball.y - 35) {
        cpu.y += cpu.speed;
    } else if (cpuCenter > ball.y + 35) {
        cpu.y -= cpu.speed;
    }

    // Keep CPU paddle within bounds
    if (cpu.y < 0) cpu.y = 0;
    if (cpu.y + cpu.height > canvas.height) {
        cpu.y = canvas.height - cpu.height;
    }
}

function moveBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Top and bottom wall collision
    if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
        ball.dy = -ball.dy;
    }

    // Player paddle collision
    if (ball.x - ball.radius < player.x + player.width &&
        ball.x + ball.radius > player.x &&
        ball.y > player.y &&
        ball.y < player.y + player.height) {

        // Calculate hit position on paddle (-1 to 1)
        const hitPos = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
        const angle = hitPos * Math.PI / 4; // Max 45 degrees

        ball.dx = ball.speed * Math.cos(angle);
        ball.dy = ball.speed * Math.sin(angle);

        // Ensure ball moves right
        if (ball.dx < 0) ball.dx = -ball.dx;

        // Increase ball speed slightly
        ball.speed *= 1.05;
        ball.x = player.x + player.width + ball.radius;
    }

    // CPU paddle collision
    if (ball.x + ball.radius > cpu.x &&
        ball.x - ball.radius < cpu.x + cpu.width &&
        ball.y > cpu.y &&
        ball.y < cpu.y + cpu.height) {

        // Calculate hit position on paddle (-1 to 1)
        const hitPos = (ball.y - (cpu.y + cpu.height / 2)) / (cpu.height / 2);
        const angle = hitPos * Math.PI / 4; // Max 45 degrees

        ball.dx = -ball.speed * Math.cos(angle);
        ball.dy = ball.speed * Math.sin(angle);

        // Ensure ball moves left
        if (ball.dx > 0) ball.dx = -ball.dx;

        // Increase ball speed slightly
        ball.speed *= 1.05;
        ball.x = cpu.x - ball.radius;
    }

    // Score detection
    if (ball.x - ball.radius < 0) {
        // CPU scores
        cpuScore++;
        updateScore();
        resetBall();
    } else if (ball.x + ball.radius > canvas.width) {
        // Player scores
        playerScore++;
        updateScore();
        resetBall();
    }

    // Check for winner
    if (playerScore >= WINNING_SCORE || cpuScore >= WINNING_SCORE) {
        endGame();
    }
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = INITIAL_BALL_SPEED;

    // Random direction
    const angle = (Math.random() * Math.PI / 2) - Math.PI / 4; // -45 to 45 degrees
    ball.dx = INITIAL_BALL_SPEED * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = INITIAL_BALL_SPEED * Math.sin(angle);
}

function updateScore() {
    document.getElementById('playerScore').textContent = playerScore;
    document.getElementById('cpuScore').textContent = cpuScore;
}

function gameLoop() {
    if (!gameRunning || gamePaused) return;

    movePaddles();
    moveBall();
    draw();

    animationId = requestAnimationFrame(gameLoop);
}

function startGame() {
    if (!gameRunning) {
        gameRunning = true;
        gamePaused = false;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        gameLoop();
    }
}

function togglePause() {
    gamePaused = !gamePaused;
    document.getElementById('pauseBtn').textContent = gamePaused ? 'Reanudar' : 'Pausar';
    if (!gamePaused) {
        gameLoop();
    }
}

function resetGame() {
    // Cancel animation
    if (animationId) {
        cancelAnimationFrame(animationId);
    }

    // Reset game state
    gameRunning = false;
    gamePaused = false;
    playerScore = 0;
    cpuScore = 0;

    // Reset positions
    player.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    cpu.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    resetBall();

    // Update UI
    updateScore();
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pauseBtn').textContent = 'Pausar';

    // Draw initial state
    draw();
}

function endGame() {
    gameRunning = false;
    const winner = playerScore >= WINNING_SCORE ? 'Jugador' : 'CPU';

    // Draw winner text on canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${winner} Gana!`, canvas.width / 2, canvas.height / 2);

    ctx.font = '24px Arial';
    ctx.fillText('Presiona "Reiniciar" para jugar de nuevo', canvas.width / 2, canvas.height / 2 + 50);

    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
}

// Initialize game
resetGame();
