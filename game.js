/**
 * Новогодняя Игра — Три в ряд (LB Bonus Match-3)
 * Поле 7x7, 6 видов блюд, лимит 60 секунд, потолок 1000 бонусов.
 * Снежинки за элементами геймплея, подсказка через 5 сек, авто-перемешивание.
 */

const GAME_CONFIG = {
    baseWidth: 390,
    height: 844,
    columns: 5,
    rows: 5,
    foodTypesCount: 6,
    maxScore: 1000,
    gameDuration: 60,
    idleHintDuration: 5.0
};

const RULES_DATA = [
    { src: 'assets/rules_card_1.webp', alt: 'Правило 1: Меняйте блюда местами' },
    { src: 'assets/rules_card_2.webp', alt: 'Правило 2: Получайте бонусы за сеты' },
    { src: 'assets/rules_card_3.webp', alt: 'Правило 3: Успейте за 60 секунд' }
];

class Match3Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.snowCanvas = document.getElementById('snowCanvas');
        this.snowCtx = this.snowCanvas.getContext('2d');
        this.confettiCanvas = document.getElementById('confettiCanvas');
        this.confettiCtx = this.confettiCanvas ? this.confettiCanvas.getContext('2d') : null;
        this.confetti = [];

        // State & Timers
        this.score = 0;
        this.displayScore = 0;
        this.timeLeft = GAME_CONFIG.gameDuration;
        this.timerInterval = null;
        this.thinkTimer = 0;
        this.isGameRunning = false;
        this.isCountingDown = false;
        this.countdownTimers = [];
        this.currentCascade = 1;

        // Level & Grid geometry (5x5 Field)
        this.level = {
            columns: GAME_CONFIG.columns,
            rows: GAME_CONFIG.rows,
            tilewidth: 66,
            tileheight: 66,
            tilegap: 5,
            x: 20,
            y: 136,
            tiles: [],
            selectedtile: { selected: false, column: -1, row: -1 }
        };

        // Match-3 algorithm containers
        this.clusters = [];
        this.moves = [];
        this.currentmove = { column1: 0, row1: 0, column2: 0, row2: 0 };

        // Game states
        this.gamestates = { ready: 0, resolve: 1, gameover: 2 };
        this.gamestate = this.gamestates.ready;

        // Animation states
        // 0: removing clusters (match pop & glow), 1: dropping/shifting tiles, 2: swapping, 3: rewind swap
        this.animationstate = 0;
        this.animationtime = 0;
        this.animationdurations = {
            match: 0.36,   // 360ms: match highlight & pop
            drop: 0.44,    // 440ms: smooth, physical tumbling drop with gentle settle
            swap: 0.34,    // 340ms: buttery-smooth swap
            rewind: 0.32   // 320ms: smooth rewind
        };

        // Incoming dropping tiles queue (symbols tumbling down from above reels)
        this.incomingTiles = [];

        // Drag & Touch input tracking
        this.drag = false;
        this.touchStartPos = { x: 0, y: 0 };
        this.touchStartTile = { column: -1, row: -1 };

        // Visual FX
        this.particles = [];
        this.floatingTexts = [];
        this.matchedTileCells = []; // glow halos

        // Snowflakes
        this.snowflakes = [];
        this.snowflakeSprites = [];

        // Assets dict
        this.images = {};
        this.assetsLoaded = false;

        // DOM elements
        this.hud = document.getElementById('hud');
        this.scoreDigits = document.getElementById('scoreDigits');
        this.progressFill = document.getElementById('progressFill');
        this.progressSanta = document.getElementById('progressSanta');
        this.timerText = document.getElementById('timerText');
        this.timerChip = document.getElementById('timerChip');
        this.comboBanner = document.getElementById('comboBanner');
        this.gameToast = document.getElementById('gameToast');

        // Rules slider DOM & state
        this.currentRuleIndex = 0;
        this.rulesCardSlot = document.getElementById('rulesCardSlot');
        this.rulesPagination = document.getElementById('rulesPagination');
        this.dualButtonsGroup = document.getElementById('dualButtonsGroup');
        this.singleStartGroup = document.getElementById('singleStartGroup');
        this.rulesNextBtn = document.getElementById('rulesNextBtn');
        this.rulesSkipBtn = document.getElementById('rulesSkipBtn');
        this.rulesStartBtn = document.getElementById('rulesStartBtn');

        this.startScreen = document.getElementById('startScreen');
        this.rulesScreen = document.getElementById('rulesScreen');
        this.countdownOverlay = document.getElementById('countdownOverlay');
        this.topBannerBox = document.getElementById('topBannerBox');

        // Results screen DOM 
        this.resultScreen = document.getElementById('resultScreen');
        this.resultScoreValue = document.getElementById('resultScoreValue');
        this.resultAttemptsText = document.getElementById('resultAttemptsText');
        this.resultBestScoreText = document.getElementById('resultBestScoreText');
        this.btnClaimBonus = document.getElementById('btnClaimBonus');
        this.btnRetryGame = document.getElementById('btnRetryGame');

        // Exit / Loyalty screen (1:1 from mockup)
        this.exitScreen = document.getElementById('exitScreen');
        this.btnExitGame = document.getElementById('btnExitGame');

        // 3 attempts system 
        this.maxAttempts = 3;
        this.attemptsUsed = 0;
        this.bestScore = 0;

        this.bgSky = document.getElementById('bgSky');
        this.bgGame = document.getElementById('bgGame');

        // Timing
        this.lastTime = performance.now();
        this.animGlobalTime = 0;

        // Telegram WebApp setup & viewport sync
        if (window.Telegram && window.Telegram.WebApp) {
            try {
                window.Telegram.WebApp.ready();
                window.Telegram.WebApp.expand();
                if (window.Telegram.WebApp.disableVerticalSwipes) {
                    window.Telegram.WebApp.disableVerticalSwipes();
                }
                window.Telegram.WebApp.onEvent('viewportChanged', () => {
                    this.handleResize();
                });
            } catch (e) {
                console.warn('Telegram WebApp init error:', e);
            }
        }

        // Init
        this.initGridArray();
        this.loadAssets();
        this.initSnowflakes();
        this.handleResize();
        this.bindEvents();

        // Start loops
        this.snowLoop = this.snowLoop.bind(this);
        requestAnimationFrame(this.snowLoop);

        this.gameLoop = this.gameLoop.bind(this);
        requestAnimationFrame(this.gameLoop);
    }

    /* -------------------------------------------------------------
       1. Grid Setup & Level Generation
       ------------------------------------------------------------- */
    initGridArray() {
        this.level.tiles = [];
        for (let i = 0; i < this.level.columns; i++) {
            this.level.tiles[i] = [];
            for (let j = 0; j < this.level.rows; j++) {
                this.level.tiles[i][j] = {
                    type: 0,
                    shift: 0,
                    alpha: 1,
                    scale: 1,
                    matched: false,
                    fallProgress: 1
                };
            }
        }
    }

    getRandomTile() {
        return Math.floor(Math.random() * GAME_CONFIG.foodTypesCount);
    }

    createLevel() {
        let done = false;
        let attempts = 0;

        while (!done && attempts < 200) {
            attempts++;
            // 1. Fill random tiles
            for (let i = 0; i < this.level.columns; i++) {
                for (let j = 0; j < this.level.rows; j++) {
                    this.level.tiles[i][j].type = this.getRandomTile();
                    this.level.tiles[i][j].shift = 0;
                    this.level.tiles[i][j].alpha = 1;
                    this.level.tiles[i][j].scale = 1;
                    this.level.tiles[i][j].matched = false;
                    this.level.tiles[i][j].fallProgress = 1;
                }
            }

            // 2. Resolve immediate clusters quietly
            this.resolveClustersQuietly();

            // 3. Find if there are valid player moves
            this.findMoves();

            // Level is ready if at least 2 moves exist
            if (this.moves.length >= 2) {
                done = true;
            }
        }
    }

    resolveClustersQuietly() {
        this.findClusters();
        let loopCount = 0;
        while (this.clusters.length > 0 && loopCount < 50) {
            loopCount++;
            for (let c = 0; c < this.clusters.length; c++) {
                const cl = this.clusters[c];
                // Change middle tile to another random type
                const midIdx = Math.floor(cl.length / 2);
                const col = cl.horizontal ? cl.column + midIdx : cl.column;
                const row = cl.horizontal ? cl.row : cl.row + midIdx;
                let newType = this.getRandomTile();
                while (newType === this.level.tiles[col][row].type) {
                    newType = this.getRandomTile();
                }
                this.level.tiles[col][row].type = newType;
            }
            this.findClusters();
        }
    }

    /* -------------------------------------------------------------
       2. Match-3 Logic Core (Rembound Algorithms)
       ------------------------------------------------------------- */
    findClusters() {
        this.clusters = [];

        // 1. Horizontal Clusters
        for (let j = 0; j < this.level.rows; j++) {
            let matchLength = 1;
            for (let i = 0; i < this.level.columns; i++) {
                let checkCluster = false;
                if (i === this.level.columns - 1) {
                    checkCluster = true;
                } else {
                    if (this.level.tiles[i][j].type === this.level.tiles[i + 1][j].type &&
                        this.level.tiles[i][j].type !== -1) {
                        matchLength += 1;
                    } else {
                        checkCluster = true;
                    }
                }

                if (checkCluster) {
                    if (matchLength >= 3) {
                        this.clusters.push({
                            column: i + 1 - matchLength,
                            row: j,
                            length: matchLength,
                            horizontal: true
                        });
                    }
                    matchLength = 1;
                }
            }
        }

        // 2. Vertical Clusters
        for (let i = 0; i < this.level.columns; i++) {
            let matchLength = 1;
            for (let j = 0; j < this.level.rows; j++) {
                let checkCluster = false;
                if (j === this.level.rows - 1) {
                    checkCluster = true;
                } else {
                    if (this.level.tiles[i][j].type === this.level.tiles[i][j + 1].type &&
                        this.level.tiles[i][j].type !== -1) {
                        matchLength += 1;
                    } else {
                        checkCluster = true;
                    }
                }

                if (checkCluster) {
                    if (matchLength >= 3) {
                        this.clusters.push({
                            column: i,
                            row: j + 1 - matchLength,
                            length: matchLength,
                            horizontal: false
                        });
                    }
                    matchLength = 1;
                }
            }
        }
    }

    findMoves() {
        this.moves = [];

        // Check horizontal swaps
        for (let j = 0; j < this.level.rows; j++) {
            for (let i = 0; i < this.level.columns - 1; i++) {
                this.swap(i, j, i + 1, j);
                this.findClusters();
                this.swap(i, j, i + 1, j);

                if (this.clusters.length > 0) {
                    this.moves.push({ column1: i, row1: j, column2: i + 1, row2: j });
                }
            }
        }

        // Check vertical swaps
        for (let i = 0; i < this.level.columns; i++) {
            for (let j = 0; j < this.level.rows - 1; j++) {
                this.swap(i, j, i, j + 1);
                this.findClusters();
                this.swap(i, j, i, j + 1);

                if (this.clusters.length > 0) {
                    this.moves.push({ column1: i, row1: j, column2: i, row2: j + 1 });
                }
            }
        }

        this.clusters = [];
    }

    swap(x1, y1, x2, y2) {
        const typeSwap = this.level.tiles[x1][y1].type;
        this.level.tiles[x1][y1].type = this.level.tiles[x2][y2].type;
        this.level.tiles[x2][y2].type = typeSwap;
    }

    canSwap(x1, y1, x2, y2) {
        return (Math.abs(x1 - x2) === 1 && y1 === y2) ||
               (Math.abs(y1 - y2) === 1 && x1 === x2);
    }

    mouseSwap(c1, r1, c2, r2) {
        this.currentmove = { column1: c1, row1: r1, column2: c2, row2: r2 };
        this.level.selectedtile.selected = false;
        this.thinkTimer = 0; // reset idle hint timer
        this.currentCascade = 1;

        this.animationstate = 2; // Swap forward
        this.animationtime = 0;
        this.gamestate = this.gamestates.resolve;
    }

    removeClusters() {
        this.matchedTileCells = [];
        this.incomingTiles = [];

        // Mark tiles as -1 and prepare animations/particles
        for (let i = 0; i < this.clusters.length; i++) {
            const cl = this.clusters[i];
            let coffset = 0;
            let roffset = 0;

            for (let j = 0; j < cl.length; j++) {
                const c = cl.column + coffset;
                const r = cl.row + roffset;

                if (this.level.tiles[c][r].type !== -1) {
                    this.spawnMatchParticles(c, r);
                    this.matchedTileCells.push({ column: c, row: r, timer: 0.35 });
                }
                this.level.tiles[c][r].type = -1;

                if (cl.horizontal) coffset++;
                else roffset++;
            }
        }

        // Calculate shift downwards for each column & queue incoming tiles from above
        for (let i = 0; i < this.level.columns; i++) {
            let shift = 0;
            for (let j = this.level.rows - 1; j >= 0; j--) {
                if (this.level.tiles[i][j].type === -1) {
                    shift++;
                    this.level.tiles[i][j].shift = 0;
                } else {
                    this.level.tiles[i][j].shift = shift;
                }
            }

            const holes = shift;
            for (let k = 0; k < holes; k++) {
                this.incomingTiles.push({
                    column: i,
                    targetRow: k,
                    startRow: k - holes,
                    type: this.getRandomTile()
                });
            }
        }
    }

    shiftTiles() {
        for (let i = 0; i < this.level.columns; i++) {
            for (let j = this.level.rows - 1; j >= 0; j--) {
                const shift = this.level.tiles[i][j].shift;
                if (shift > 0) {
                    this.swap(i, j, i, j + shift);
                }
                this.level.tiles[i][j].shift = 0;
            }
        }

        // Commit incoming tiles falling from above into their landed slots
        if (this.incomingTiles && this.incomingTiles.length > 0) {
            for (let n = 0; n < this.incomingTiles.length; n++) {
                const inc = this.incomingTiles[n];
                this.level.tiles[inc.column][inc.targetRow].type = inc.type;
            }
            this.incomingTiles = [];
        } else {
            for (let i = 0; i < this.level.columns; i++) {
                for (let j = 0; j < this.level.rows; j++) {
                    if (this.level.tiles[i][j].type === -1) {
                        this.level.tiles[i][j].type = this.getRandomTile();
                    }
                }
            }
        }
    }

    shuffleBoard() {
        this.showToast('Нет ходов! Перемешиваем...');

        let attempts = 0;
        let valid = false;

        while (!valid && attempts < 100) {
            attempts++;
            // Collect all current types
            const types = [];
            for (let i = 0; i < this.level.columns; i++) {
                for (let j = 0; j < this.level.rows; j++) {
                    types.push(this.level.tiles[i][j].type);
                }
            }
            // Shuffle array
            for (let k = types.length - 1; k > 0; k--) {
                const r = Math.floor(Math.random() * (k + 1));
                [types[k], types[r]] = [types[r], types[k]];
            }
            // Re-apply
            let idx = 0;
            for (let i = 0; i < this.level.columns; i++) {
                for (let j = 0; j < this.level.rows; j++) {
                    this.level.tiles[i][j].type = types[idx++];
                }
            }
            this.resolveClustersQuietly();
            this.findMoves();
            if (this.moves.length > 0) {
                valid = true;
            }
        }
    }

    /* -------------------------------------------------------------
       3. Scoring, Combos & HUD
       ------------------------------------------------------------- */
    addScoreForClusters() {
        let totalGain = 0;

        for (let i = 0; i < this.clusters.length; i++) {
            const cl = this.clusters[i];
            let base = 30;
            if (cl.length === 4) base = 60;
            if (cl.length >= 5) base = 120;

            const multiplier = this.currentCascade >= 4 ? 2.0 :
                               this.currentCascade === 3 ? 1.6 :
                               this.currentCascade === 2 ? 1.3 : 1.0;

            const gain = Math.round(base * multiplier);
            totalGain += gain;

            // Spawn floating score text
            const coord = this.getTileCenter(cl.column + (cl.horizontal ? Math.floor(cl.length / 2) : 0),
                                             cl.row + (!cl.horizontal ? Math.floor(cl.length / 2) : 0));
            this.spawnFloatingText(`+${gain}`, coord.x, coord.y, cl.length >= 4 ? '#ffea00' : '#ffffff');
        }

        if (this.currentCascade > 1) {
            this.showComboBanner(`КОМБО x${this.currentCascade}!`);
        }

        this.score = Math.min(GAME_CONFIG.maxScore, this.score + totalGain);
        this.updateHUD();

        if (this.score >= GAME_CONFIG.maxScore) {
            this.endGame(true);
        }
    }

    updateHUD() {
        if (this.scoreDigits) {
            this.scoreDigits.textContent = String(Math.min(GAME_CONFIG.maxScore, this.score)).padStart(4, '0');
        }

        // Santa sliding progress track (0% to 100%)
        if (this.progressSanta && this.progressFill) {
            const progress = Math.min(1.0, this.score / GAME_CONFIG.maxScore);
            const pct = Math.round(progress * 100);
            this.progressSanta.style.left = `${pct}%`;
            this.progressFill.style.width = `${pct}%`;
        }
    }

    showComboBanner(text) {
        this.comboBanner.textContent = text;
        this.comboBanner.classList.remove('hidden');
        clearTimeout(this.comboTimeout);
        this.comboTimeout = setTimeout(() => {
            this.comboBanner.classList.add('hidden');
        }, 1200);
    }

    showToast(text) {
        this.gameToast.textContent = text;
        this.gameToast.classList.remove('hidden');
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.gameToast.classList.add('hidden');
        }, 1500);
    }

    /* -------------------------------------------------------------
       4. Visual Particles & Floating Texts
       ------------------------------------------------------------- */
    spawnMatchParticles(col, row) {
        const center = this.getTileCenter(col, row);
        const count = 10;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1.5;
            this.particles.push({
                x: center.x,
                y: center.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                decay: Math.random() * 0.04 + 0.03,
                size: Math.random() * 5 + 3,
                color: ['#ffdd00', '#ffffff', '#ff9a00', '#64d2ff'][Math.floor(Math.random() * 4)]
            });
        }
    }

    spawnFloatingText(text, x, y, color = '#ffffff') {
        this.floatingTexts.push({
            text: text,
            x: x,
            y: y,
            vy: -0.8,
            alpha: 1.0,
            color: color
        });
    }

    updateAndRenderEffects(ctx, dt) {
        // 1. Matched cell halos
        for (let i = this.matchedTileCells.length - 1; i >= 0; i--) {
            const h = this.matchedTileCells[i];
            h.timer -= dt;
            if (h.timer <= 0) {
                this.matchedTileCells.splice(i, 1);
            }
        }

        // 2. Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 3. Floating texts (soft, elegant, non-aggressive design)
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y += ft.vy;
            ft.alpha -= dt * 0.75;
            if (ft.alpha <= 0) {
                this.floatingTexts.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = Math.max(0, ft.alpha);
            ctx.font = '700 20px "Suisse Intl", -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = 'rgba(5, 68, 154, 0.45)';
            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = 'rgba(5, 68, 154, 0.22)';
            ctx.shadowBlur = 4;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        }
    }

    /* -------------------------------------------------------------
       5. Game Loop & State Updates
       ------------------------------------------------------------- */
    getAnimationDuration(state) {
        if (state === 0) return this.animationdurations.match;
        if (state === 1) return this.animationdurations.drop;
        if (state === 2) return this.animationdurations.swap;
        if (state === 3) return this.animationdurations.rewind;
        return 0.35;
    }

    update(dt) {
        this.animGlobalTime += dt;

        if (this.gamestate === this.gamestates.ready) {
            // Idle Hint timer (after 5 seconds of thinking, highlight move)
            this.thinkTimer += dt;

            // Check if moves available
            if (this.moves.length <= 0) {
                this.shuffleBoard();
            }
        } else if (this.gamestate === this.gamestates.resolve) {
            this.animationtime += dt;
            const currentDuration = this.getAnimationDuration(this.animationstate);

            // State 0: Match removal (celebrate match)
            if (this.animationstate === 0) {
                if (this.animationtime > currentDuration) {
                    this.findClusters();
                    if (this.clusters.length > 0) {
                        this.addScoreForClusters();
                        this.removeClusters();
                        this.animationstate = 1; // proceed to drop tiles
                    } else {
                        // All cascades resolved!
                        this.gamestate = this.gamestates.ready;
                        this.findMoves();
                    }
                    this.animationtime = 0;
                }
            }
            // State 1: Drop & Shift tiles
            else if (this.animationstate === 1) {
                if (this.animationtime > currentDuration) {
                    this.shiftTiles();
                    this.animationstate = 0;
                    this.animationtime = 0;
                    this.currentCascade++;

                    this.findClusters();
                    if (this.clusters.length <= 0) {
                        this.gamestate = this.gamestates.ready;
                        this.findMoves();
                    }
                }
            }
            // State 2: Player swap animation
            else if (this.animationstate === 2) {
                if (this.animationtime > currentDuration) {
                    this.swap(this.currentmove.column1, this.currentmove.row1,
                              this.currentmove.column2, this.currentmove.row2);

                    this.findClusters();
                    if (this.clusters.length > 0) {
                        // Valid move!
                        this.animationstate = 0;
                        this.animationtime = 0;
                        this.gamestate = this.gamestates.resolve;
                    } else {
                        // Invalid move, rewind!
                        this.animationstate = 3;
                        this.animationtime = 0;
                    }
                    this.findMoves();
                }
            }
            // State 3: Rewind swap animation
            else if (this.animationstate === 3) {
                if (this.animationtime > currentDuration) {
                    this.swap(this.currentmove.column1, this.currentmove.row1,
                              this.currentmove.column2, this.currentmove.row2);
                    this.gamestate = this.gamestates.ready;
                    this.findMoves();
                }
            }
        }
    }

    gameLoop(timestamp) {
        const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;

        if (this.isGameRunning) {
            this.update(dt);
        }

        this.render(dt);
        requestAnimationFrame(this.gameLoop);
    }

    /* -------------------------------------------------------------
       6. Rendering Canvas Grid & Dishes
       ------------------------------------------------------------- */
    render(dt) {
        this.ctx.clearRect(0, 0, GAME_CONFIG.baseWidth, GAME_CONFIG.height);

        // Draw grid, plates and dishes when game is actively running or counting down
        if (!this.isGameRunning && !this.isCountingDown) return;

        // Render Grid
        this.renderBoardPlates();
        this.renderTiles();
        this.updateAndRenderEffects(this.ctx, dt);
    }

    getTileCoordinate(col, row, colOffset = 0, rowOffset = 0) {
        const totalTileW = this.level.tilewidth + this.level.tilegap;
        const totalTileH = this.level.tileheight + this.level.tilegap;
        const x = this.level.x + (col + colOffset) * totalTileW;
        const y = this.level.y + (row + rowOffset) * totalTileH;
        return { x, y };
    }

    getTileCenter(col, row) {
        const coord = this.getTileCoordinate(col, row);
        return {
            x: coord.x + this.level.tilewidth / 2,
            y: coord.y + this.level.tileheight / 2
        };
    }

    renderBoardPlates() {
        const normalPlate = this.images['tile_normal'];
        const matchedPlate = this.images['tile_matched'];

        for (let i = 0; i < this.level.columns; i++) {
            for (let j = 0; j < this.level.rows; j++) {
                const coord = this.getTileCoordinate(i, j);
                const isMatched = this.matchedTileCells.some(m => m.column === i && m.row === j);

                if (isMatched && matchedPlate && matchedPlate.complete) {
                    // Glowing matched plate (with glow margin 187 vs 150)
                    const glowPad = Math.round(this.level.tilewidth * (18.5 / 150));
                    this.ctx.drawImage(matchedPlate,
                        coord.x - glowPad, coord.y - glowPad,
                        this.level.tilewidth + glowPad * 2, this.level.tileheight + glowPad * 2);
                } else if (normalPlate && normalPlate.complete) {
                    this.ctx.drawImage(normalPlate, coord.x, coord.y, this.level.tilewidth, this.level.tileheight);
                }
            }
        }
    }

    renderTiles() {
        const isSwapping = this.gamestate === this.gamestates.resolve &&
                           (this.animationstate === 2 || this.animationstate === 3);

        const isDropping = this.gamestate === this.gamestates.resolve &&
                           this.animationstate === 1;

        const swapC1 = this.currentmove.column1;
        const swapR1 = this.currentmove.row1;
        const swapC2 = this.currentmove.column2;
        const swapR2 = this.currentmove.row2;

        const currentDuration = this.getAnimationDuration(this.animationstate);
        const animProgress = Math.min(1.0, this.animationtime / currentDuration);

        // Check if idle hint is active (5 seconds of inactivity)
        const showHint = this.gamestate === this.gamestates.ready &&
                         this.thinkTimer >= GAME_CONFIG.idleHintDuration &&
                         this.moves.length > 0;
        const hintMove = showHint ? this.moves[0] : null;

        // Smooth physics-based easeDrop with gentle settle landing
        let easeDrop = 0;
        if (isDropping) {
            const p = animProgress;
            // Gentle easeOutBack (c1 = 0.45) for natural, silky tumbling and subtle landing settle
            const c1 = 0.45;
            const c3 = c1 + 1;
            easeDrop = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
        }

        // Clip board viewport so symbols tumbling down from above emerge from sky below HUD
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 85, GAME_CONFIG.baseWidth, GAME_CONFIG.height - 85);
        this.ctx.clip();

        // 1. Render existing tiles on board
        for (let i = 0; i < this.level.columns; i++) {
            for (let j = 0; j < this.level.rows; j++) {
                if (isSwapping && ((i === swapC1 && j === swapR1) || (i === swapC2 && j === swapR2))) {
                    continue;
                }

                const tile = this.level.tiles[i][j];
                if (tile.type < 0) continue;

                let shiftY = 0;
                if (isDropping) {
                    shiftY = easeDrop * tile.shift;
                }

                const coord = this.getTileCoordinate(i, j, 0, shiftY);
                const isSelected = this.level.selectedtile.selected &&
                                   this.level.selectedtile.column === i &&
                                   this.level.selectedtile.row === j;

                const isHinted = hintMove &&
                    ((hintMove.column1 === i && hintMove.row1 === j) ||
                     (hintMove.column2 === i && hintMove.row2 === j));

                this.drawDish(tile.type, coord.x, coord.y, isSelected, isHinted);
            }
        }

        // 2. Render NEW incoming tiles tumbling down from above the reels!
        if (isDropping && this.incomingTiles && this.incomingTiles.length > 0) {
            for (let n = 0; n < this.incomingTiles.length; n++) {
                const inc = this.incomingTiles[n];
                // Smooth fall from above the top row (startRow < 0) down to targetRow
                const currentVisualRow = inc.startRow + easeDrop * (inc.targetRow - inc.startRow);
                const coord = this.getTileCoordinate(inc.column, 0, 0, currentVisualRow);
                this.drawDish(inc.type, coord.x, coord.y, false, false);
            }
        }

        this.ctx.restore();

        // Render swapping tiles with smooth ease curve
        if (isSwapping) {
            const shiftX = swapC2 - swapC1;
            const shiftY = swapR2 - swapR1;

            let t = animProgress;
            // Smooth ease in out (cubic)
            t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            if (this.animationstate === 3) {
                // Rewind
                t = 1 - t;
            }

            const coord1 = this.getTileCoordinate(swapC1, swapR1, t * shiftX, t * shiftY);
            const coord2 = this.getTileCoordinate(swapC2, swapR2, -t * shiftX, -t * shiftY);

            const t1 = this.level.tiles[swapC1][swapR1];
            const t2 = this.level.tiles[swapC2][swapR2];

            this.drawDish(t1.type, coord1.x, coord1.y, false, false);
            this.drawDish(t2.type, coord2.x, coord2.y, false, false);
        }

        // Render prominent hint overlay when user is idle > 5 seconds
        if (showHint && hintMove) {
            this.renderHintOverlay(hintMove);
        }
    }

    renderHintOverlay(hintMove) {
        if (!hintMove) return;
        const c1 = hintMove.column1;
        const r1 = hintMove.row1;
        const c2 = hintMove.column2;
        const r2 = hintMove.row2;

        const p1 = this.getTileCenter(c1, r1);
        const p2 = this.getTileCenter(c2, r2);

        this.ctx.save();

        const pulse = 0.65 + 0.35 * Math.sin(this.animGlobalTime * 8);

        // 1. Glowing golden frames around both hinted tiles
        [{ c: c1, r: r1 }, { c: c2, r: r2 }].forEach(({ c, r }) => {
            const coord = this.getTileCoordinate(c, r);
            const w = this.level.tilewidth;
            const h = this.level.tileheight;

            this.ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
            this.ctx.lineWidth = 3.5;
            this.ctx.shadowColor = 'rgba(255, 190, 0, 0.9)';
            this.ctx.shadowBlur = 14;

            if (this.ctx.roundRect) {
                this.ctx.beginPath();
                this.ctx.roundRect(coord.x - 2, coord.y - 2, w + 4, h + 4, 14);
                this.ctx.stroke();
            } else {
                this.ctx.strokeRect(coord.x - 2, coord.y - 2, w + 4, h + 4);
            }
        });

        // 2. Animated dashed connection indicator between the two tiles
        this.ctx.beginPath();
        this.ctx.setLineDash([8, 5]);
        this.ctx.lineDashOffset = -this.animGlobalTime * 30;
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = `rgba(255, 245, 120, ${pulse})`;
        this.ctx.lineWidth = 3.5;
        this.ctx.shadowColor = '#ffbb00';
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawDish(type, x, y, isSelected = false, isHinted = false) {
        const img = this.images[`food_${type}`];
        if (!img || !img.complete) return;

        this.ctx.save();

        const cx = x + this.level.tilewidth / 2;
        const cy = y + this.level.tileheight / 2;

        let scale = 1.0;
        if (isSelected) {
            scale = 1.15;
            // Draw glowing halo around selected tile
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = '#ffe100';
            this.ctx.shadowBlur = 10;
            this.ctx.strokeRect(x, y, this.level.tilewidth, this.level.tileheight);
        } else if (isHinted) {
            // Cheerful pulsating hint bounce
            scale = 1.0 + 0.10 * Math.sin(this.animGlobalTime * 7);
        }

        this.ctx.translate(cx, cy);
        this.ctx.scale(scale, scale);

        // Draw dish centered inside cell
        const dishSize = Math.round(this.level.tilewidth * 0.91);
        this.ctx.drawImage(img, -dishSize / 2, -dishSize / 2, dishSize, dishSize);

        this.ctx.restore();
    }

    /* -------------------------------------------------------------
       7. Touch & Mouse Input Handlers
       ------------------------------------------------------------- */
    getTileUnderPos(pos) {
        const totalTileW = this.level.tilewidth + this.level.tilegap;
        const totalTileH = this.level.tileheight + this.level.tilegap;

        const tx = Math.floor((pos.x - this.level.x) / totalTileW);
        const ty = Math.floor((pos.y - this.level.y) / totalTileH);

        if (tx >= 0 && tx < this.level.columns && ty >= 0 && ty < this.level.rows) {
            return { valid: true, x: tx, y: ty };
        }
        return { valid: false, x: -1, y: -1 };
    }

    onPointerDown(e) {
        if (!this.isGameRunning || this.gamestate !== this.gamestates.ready) return;

        const pos = this.getCanvasPos(e);
        const mt = this.getTileUnderPos(pos);

        this.thinkTimer = 0; // reset hint timer on touch

        if (mt.valid) {
            this.drag = true;
            this.touchStartPos = { x: pos.x, y: pos.y };
            this.touchStartTile = { column: mt.x, row: mt.y };

            if (this.level.selectedtile.selected) {
                // If another tile was already selected, check if we can swap
                if (this.canSwap(mt.x, mt.y, this.level.selectedtile.column, this.level.selectedtile.row)) {
                    this.mouseSwap(mt.x, mt.y, this.level.selectedtile.column, this.level.selectedtile.row);
                    this.drag = false;
                    return;
                }
            }

            // Otherwise, select this tile
            this.level.selectedtile.column = mt.x;
            this.level.selectedtile.row = mt.y;
            this.level.selectedtile.selected = true;
        } else {
            this.level.selectedtile.selected = false;
            this.drag = false;
        }
    }

    onPointerMove(e) {
        if (!this.drag || !this.isGameRunning || this.gamestate !== this.gamestates.ready) return;

        const pos = this.getCanvasPos(e);
        const dx = pos.x - this.touchStartPos.x;
        const dy = pos.y - this.touchStartPos.y;
        const threshold = 16;

        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
            let targetCol = this.touchStartTile.column;
            let targetRow = this.touchStartTile.row;

            if (Math.abs(dx) > Math.abs(dy)) {
                targetCol += dx > 0 ? 1 : -1;
            } else {
                targetRow += dy > 0 ? 1 : -1;
            }

            if (targetCol >= 0 && targetCol < this.level.columns &&
                targetRow >= 0 && targetRow < this.level.rows) {
                this.mouseSwap(this.touchStartTile.column, this.touchStartTile.row, targetCol, targetRow);
            }

            this.drag = false;
            this.level.selectedtile.selected = false;
        }
    }

    onPointerUp() {
        this.drag = false;
    }

    getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = rect.width / GAME_CONFIG.baseWidth;

        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale
        };
    }

    /* -------------------------------------------------------------
       8. Authentic Falling Snowflakes Loop (Layer 2)
       ------------------------------------------------------------- */
    initSnowflakes() {
        this.snowflakes = [];
        const count = 35;
        for (let i = 0; i < count; i++) {
            this.snowflakes.push({
                x: Math.random() * GAME_CONFIG.baseWidth,
                y: Math.random() * GAME_CONFIG.height,
                spriteIndex: Math.floor(Math.random() * 22),
                scale: Math.random() * 0.35 + 0.35,
                speedY: Math.random() * 1.4 + 0.8,
                speedX: (Math.random() - 0.5) * 0.5,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.02,
                swaySpeed: Math.random() * 0.025 + 0.015,
                swayAmp: Math.random() * 1.2 + 0.4,
                phase: Math.random() * Math.PI * 2,
                opacity: Math.random() * 0.45 + 0.55
            });
        }
    }

    snowLoop() {
        this.snowCtx.clearRect(0, 0, GAME_CONFIG.baseWidth, GAME_CONFIG.height);

        for (let i = 0; i < this.snowflakes.length; i++) {
            const s = this.snowflakes[i];
            s.y += s.speedY;
            s.phase += s.swaySpeed;
            s.x += Math.sin(s.phase) * s.swayAmp + s.speedX;
            s.rotation += s.rotSpeed;

            if (s.y > GAME_CONFIG.height + 20) {
                s.y = -20;
                s.x = Math.random() * GAME_CONFIG.baseWidth;
            }
            if (s.x > GAME_CONFIG.baseWidth + 20) s.x = -20;
            if (s.x < -20) s.x = GAME_CONFIG.baseWidth + 20;

            const sprite = this.snowflakeSprites[s.spriteIndex];
            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                this.snowCtx.save();
                this.snowCtx.globalAlpha = s.opacity;
                this.snowCtx.translate(s.x, s.y);
                this.snowCtx.rotate(s.rotation);
                this.snowCtx.scale(s.scale, s.scale);
                this.snowCtx.drawImage(sprite, -sprite.naturalWidth / 2, -sprite.naturalHeight / 2);
                this.snowCtx.restore();
            }
        }

        // Festive Confetti (celebration on attempt end )
        if (this.confettiCtx && this.confetti && this.confetti.length > 0) {
            this.updateAndRenderConfetti(this.confettiCtx);
        }

        requestAnimationFrame(this.snowLoop);
    }

    spawnConfetti() {
        this.confetti = [];
        const colors = ['#ffd166', '#ff4757', '#06d6a0', '#118ab2', '#ffffff', '#ffa502', '#ff6b81', '#a29bfe'];
        for (let i = 0; i < 95; i++) {
            this.confetti.push({
                x: Math.random() * GAME_CONFIG.baseWidth,
                y: Math.random() * -280 - 15,
                vx: (Math.random() - 0.5) * 3.6,
                vy: Math.random() * 3.4 + 2.2,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 8 + 6,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 9,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: Math.random() * 0.12 + 0.06
            });
        }
    }

    updateAndRenderConfetti(ctx) {
        ctx.clearRect(0, 0, GAME_CONFIG.baseWidth, GAME_CONFIG.height);
        if (!this.confetti || this.confetti.length === 0) return;

        let activeCount = 0;
        for (let i = 0; i < this.confetti.length; i++) {
            const c = this.confetti[i];
            c.x += c.vx;
            c.y += c.vy;
            c.vy += 0.085; // smooth festive gravity
            c.rotation += c.rotSpeed;
            c.wobble += c.wobbleSpeed;
            c.x += Math.sin(c.wobble) * 0.55; // fluttering sway

            if (c.y < GAME_CONFIG.height + 40) {
                activeCount++;
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate((c.rotation * Math.PI) / 180);
                const scaleY = Math.cos(c.wobble);
                ctx.scale(1, scaleY);
                ctx.fillStyle = c.color;
                ctx.fillRect(-c.size / 2, -c.size * 0.38, c.size, c.size * 0.76);
                ctx.restore();
            }
        }
        if (activeCount === 0) {
            this.confetti = [];
            ctx.clearRect(0, 0, GAME_CONFIG.baseWidth, GAME_CONFIG.height);
        }
    }

    /* -------------------------------------------------------------
       9. Flow & Screens Transitions
       ------------------------------------------------------------- */
    showRuleSlide(index) {
        if (index < 0 || index >= RULES_DATA.length) return;
        this.currentRuleIndex = index;
        const data = RULES_DATA[index];

        if (this.rulesCardSlot) {
            const existingImg = this.rulesCardSlot.querySelector('.rules-card-img');
            if (!existingImg || existingImg.getAttribute('src') !== data.src) {
                this.rulesCardSlot.innerHTML = `<img src="${data.src}" class="rules-card-img" alt="${data.alt}">`;
            }
        }

        // Update pagination dots
        if (this.rulesPagination) {
            const dots = this.rulesPagination.querySelectorAll('.pagination-dot');
            dots.forEach((dot, i) => {
                if (i === index) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        }

        // Toggle buttons (Next+Skip on slides 0..1, Start on last slide 2)
        if (index === RULES_DATA.length - 1) {
            if (this.dualButtonsGroup) this.dualButtonsGroup.classList.add('hidden');
            if (this.singleStartGroup) this.singleStartGroup.classList.remove('hidden');
        } else {
            if (this.dualButtonsGroup) this.dualButtonsGroup.classList.remove('hidden');
            if (this.singleStartGroup) this.singleStartGroup.classList.add('hidden');
        }
    }

    resetGameplayState() {
        // Очистка праздничного конфетти
        this.confetti = [];
        if (this.confettiCtx) {
            this.confettiCtx.clearRect(0, 0, GAME_CONFIG.baseWidth, GAME_CONFIG.height);
        }

        // 1. Очистка таймеров
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        if (this.countdownTimers) {
            this.countdownTimers.forEach(clearTimeout);
        }
        this.countdownTimers = [];
        clearTimeout(this.comboTimeout);
        clearTimeout(this.toastTimeout);

        // 2. Сброс счета и времени
        this.score = 0;
        this.displayScore = 0;
        this.timeLeft = GAME_CONFIG.gameDuration;
        this.thinkTimer = 0;
        this.isGameRunning = false;
        this.isCountingDown = false;
        this.currentCascade = 1;

        // 3. Сброс состояния поля и анимаций
        this.clusters = [];
        this.moves = [];
        this.floatingScores = [];
        this.particles = [];
        this.matchedTileCells = [];
        this.hintTiles = [];
        this.drag = false;
        if (this.level && this.level.selectedtile) {
            this.level.selectedtile = { selected: false, column: -1, row: -1 };
        }

        // 4. Сброс DOM элементов HUD к начальному чистому состоянию
        if (this.timerChip) {
            this.timerChip.classList.remove('low-time');
        }
        if (this.timerText) {
            this.timerText.textContent = `${this.timeLeft}с`;
        }
        if (this.scoreDigits) {
            this.scoreDigits.textContent = '0000';
        }
        if (this.progressFill) {
            this.progressFill.style.width = '0%';
        }
        if (this.progressSanta) {
            this.progressSanta.style.left = '0%';
        }
        if (this.comboBanner) {
            this.comboBanner.classList.add('hidden');
        }
        if (this.gameToast) {
            this.gameToast.classList.add('hidden');
        }
        if (this.exitScreen) {
            this.exitScreen.classList.add('hidden');
        }
    }

    startGame() {
        this.resetGameplayState();

        // 1. Скрываем правила, результаты, обложку и верхнюю ленту
        this.rulesScreen.classList.add('hidden');
        if (this.startScreen) this.startScreen.classList.add('hidden');
        if (this.resultScreen) this.resultScreen.classList.add('hidden');
        if (this.exitScreen) this.exitScreen.classList.add('hidden');
        if (this.topBannerBox) this.topBannerBox.classList.add('hidden');

        // 2. Отображаем игровой фон, канвас и HUD ЗА плашкой отсчета
        this.bgGame.classList.add('active');
        this.canvas.classList.remove('hidden');
        this.hud.classList.remove('hidden');

        // 3. Создаем начальное поле 5х5, чтобы игровое поле было видно под стеклянной карточкой
        this.createLevel();
        this.isGameRunning = false;
        this.isCountingDown = true;
        this.gamestate = this.gamestates.ready;

        // 4. Показываем плашку обратного отсчета поверх игрового поля
        this.countdownOverlay.classList.remove('hidden');

        // Очищаем предыдущие таймеры отсчета
        if (this.countdownTimers) {
            this.countdownTimers.forEach(clearTimeout);
        }
        this.countdownTimers = [];

        // Play 3.. 2.. 1.. sequence
        const cnt3 = document.getElementById('cnt3');
        const cnt2 = document.getElementById('cnt2');
        const cnt1 = document.getElementById('cnt1');

        [cnt3, cnt2, cnt1].forEach(el => el.classList.remove('active'));

        cnt3.classList.add('active');
        this.countdownTimers.push(setTimeout(() => {
            cnt3.classList.remove('active');
            cnt2.classList.add('active');
        }, 950));

        this.countdownTimers.push(setTimeout(() => {
            cnt2.classList.remove('active');
            cnt1.classList.add('active');
        }, 1900));

        this.countdownTimers.push(setTimeout(() => {
            cnt1.classList.remove('active');
            this.countdownOverlay.classList.add('hidden');

            // 5. Отсчет завершен — запускаем интерактивную игру и включаем таймер!
            this.isCountingDown = false;
            this.isGameRunning = true;
            this.gamestate = this.gamestates.ready;
            this.startTimer();
        }, 2850));
    }

    startTimer() {
        clearInterval(this.timerInterval);
        this.timerText.textContent = `${this.timeLeft}с`;
        this.timerChip.classList.remove('low-time');

        this.timerInterval = setInterval(() => {
            if (!this.isGameRunning) return;

            this.timeLeft--;
            this.timerText.textContent = `${this.timeLeft}с`;

            if (this.timeLeft <= 10) {
                this.timerChip.classList.add('low-time');
            }

            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.endGame(false);
            }
        }, 1000);
    }

    endGame(isMaxScore = false) {
        this.showResult(this.score, isMaxScore);
    }

    showResult(score, isMaxScore = false) {
        this.isGameRunning = false;
        clearInterval(this.timerInterval);

        this.attemptsUsed++;
        this.bestScore = Math.max(this.bestScore, score);
        const attemptsLeft = Math.max(0, this.maxAttempts - this.attemptsUsed);

        // Hide canvas, HUD, gameplay background, cover and rules screens
        if (this.startScreen) this.startScreen.classList.add('hidden');
        if (this.rulesScreen) this.rulesScreen.classList.add('hidden');
        if (this.canvas) this.canvas.classList.add('hidden');
        if (this.hud) this.hud.classList.add('hidden');
        if (this.bgGame) this.bgGame.classList.remove('active');
        if (this.topBannerBox) this.topBannerBox.classList.add('hidden');

        // Dynamic score output (e.g. +350)
        if (this.resultScoreValue) {
            this.resultScoreValue.textContent = `+${score}`;
        }

        // Dynamic attempts output (e.g. Осталось попыток: 2/3)
        if (this.resultAttemptsText) {
            this.resultAttemptsText.textContent = `Осталось попыток: ${attemptsLeft}/${this.maxAttempts}`;
        }

        // Dynamic best score output (e.g. Ваш лучший результат: 350)
        if (this.resultBestScoreText) {
            this.resultBestScoreText.textContent = `Ваш лучший результат: ${this.bestScore}`;
        }

        // Hide Retry button if no attempts left (on 3rd attempt)
        if (this.btnRetryGame) {
            if (attemptsLeft > 0) {
                this.btnRetryGame.classList.remove('hidden');
            } else {
                this.btnRetryGame.classList.add('hidden');
            }
        }

        // Show result screen 
        if (this.resultScreen) {
            this.resultScreen.classList.remove('hidden');
        }

        // Запуск праздничного конфетти 
        this.spawnConfetti();
    }

    /* -------------------------------------------------------------
       9b. Exit Screen & Telegram WebApp Close
       ------------------------------------------------------------- */
    showExitScreen() {
        this.isGameRunning = false;
        clearInterval(this.timerInterval);

        if (!this.exitScreen) {
            this.exitScreen = document.getElementById('exitScreen');
        }
        if (!this.btnExitGame) {
            this.btnExitGame = document.getElementById('btnExitGame');
        }

        // Hide other screens & gameplay
        if (this.resultScreen) this.resultScreen.classList.add('hidden');
        if (this.startScreen) this.startScreen.classList.add('hidden');
        if (this.rulesScreen) this.rulesScreen.classList.add('hidden');
        if (this.canvas) this.canvas.classList.add('hidden');
        if (this.hud) this.hud.classList.add('hidden');
        if (this.bgGame) this.bgGame.classList.remove('active');
        if (this.topBannerBox) this.topBannerBox.classList.add('hidden');

        // Clear celebratory confetti
        this.confetti = [];
        if (this.confettiCtx) {
            this.confettiCtx.clearRect(0, 0, GAME_CONFIG.baseWidth, GAME_CONFIG.height);
        }

        // Ensure sky background is active
        if (this.bgSky) this.bgSky.classList.add('active');

        // Show exit screen
        if (this.exitScreen) {
            this.exitScreen.classList.remove('hidden');
        }
    }

    closeApp() {
        // 1. Telegram WebApp Close
        try {
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
                window.Telegram.WebApp.close();
                return;
            }
        } catch (e) {
            console.warn('Telegram WebApp close error:', e);
        }

        // 2. Standard browser close
        try {
            window.close();
        } catch (e) {
            console.warn('window.close() failed:', e);
        }

        // 3. Fallback for non-script opened tabs
        setTimeout(() => {
            try {
                window.location.href = 'about:blank';
            } catch (e) {}
        }, 150);
    }

    /* -------------------------------------------------------------
       10. Responsive Canvas Resizing & DPR 
       ------------------------------------------------------------- */
    handleResize() {
        let appH = window.innerHeight;
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.viewportHeight) {
            appH = window.Telegram.WebApp.viewportHeight;
        }
        document.documentElement.style.setProperty('--app-height', `${appH}px`);

        const container = document.getElementById('gameContainer');
        const rect = container ? container.getBoundingClientRect() : { width: window.innerWidth, height: appH };
        const baseWidth = GAME_CONFIG.baseWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const clientWidth = (rect && rect.width > 0) ? rect.width : window.innerWidth;
        const clientHeight = (rect && rect.height > 0) ? rect.height : appH;

        const scale = clientWidth / baseWidth;
        GAME_CONFIG.height = Math.round(clientHeight / scale);

        // Adjust Grid Y position to sit centered in upper sky area above restaurants with generous clearance from the timer
        const skyHeight = GAME_CONFIG.height * 0.68;
        const gridTotalH = this.level.rows * this.level.tileheight + (this.level.rows - 1) * this.level.tilegap;
        this.level.y = Math.round(Math.max(136, (skyHeight - gridTotalH) / 2 + 18));

        const gridTotalW = this.level.columns * this.level.tilewidth + (this.level.columns - 1) * this.level.tilegap;
        this.level.x = Math.round((baseWidth - gridTotalW) / 2);

        [this.canvas, this.snowCanvas, this.confettiCanvas].forEach(cnv => {
            if (!cnv) return;
            cnv.width = Math.round(clientWidth * dpr);
            cnv.height = Math.round(clientHeight * dpr);
            const ctx = cnv.getContext('2d');
            ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
        });
    }

    /* -------------------------------------------------------------
       11. Assets Preloading
       ------------------------------------------------------------- */
    loadAssets() {
        const toLoad = {
            food_0: 'assets/food_0.webp',
            food_1: 'assets/food_1.webp',
            food_2: 'assets/food_2.webp',
            food_3: 'assets/food_3.webp',
            food_4: 'assets/food_4.webp',
            food_5: 'assets/food_5.webp',
            food_6: 'assets/food_6.webp',
            tile_normal: 'assets/tile_normal.webp',
            tile_matched: 'assets/tile_matched.webp',
            bg_game: 'assets/bg_game.webp',
            progress_santa: 'assets/progress_santa.webp',
            coin_lb: 'assets/coin_lb.webp'
        };

        const promises = [];
        for (const [key, src] of Object.entries(toLoad)) {
            const img = new Image();
            img.src = src;
            this.images[key] = img;
            promises.push(new Promise(res => { img.onload = img.onerror = res; }));
        }

        // Snowflakes sprites
        for (let i = 0; i < 22; i++) {
            const fImg = new Image();
            fImg.src = `assets/snowflakes/flake_${i}.webp`;
            this.snowflakeSprites.push(fImg);
            promises.push(new Promise(res => { fImg.onload = fImg.onerror = res; }));
        }

        Promise.all(promises).then(() => {
            this.assetsLoaded = true;
            console.log('All Match-3 assets preloaded!');
        });
    }

    /* -------------------------------------------------------------
       12. Bind User Interactions
       ------------------------------------------------------------- */
    bindEvents() {
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 150));

        // Screen 1: Play button
        document.getElementById('playBtn').addEventListener('click', () => {
            this.startScreen.classList.add('hidden');
            this.rulesScreen.classList.remove('hidden');
            this.showRuleSlide(0);
        });

        // Rules slider navigation (Next, Skip, Start)
        if (this.rulesNextBtn) {
            this.rulesNextBtn.addEventListener('click', () => {
                if (this.currentRuleIndex < RULES_DATA.length - 1) {
                    this.showRuleSlide(this.currentRuleIndex + 1);
                }
            });
        }

        if (this.rulesSkipBtn) {
            this.rulesSkipBtn.addEventListener('click', () => {
                this.startGame();
            });
        }

        if (this.rulesStartBtn) {
            this.rulesStartBtn.addEventListener('click', () => {
                this.startGame();
            });
        }

        // Click on dots
        if (this.rulesPagination) {
            const dots = this.rulesPagination.querySelectorAll('.pagination-dot');
            dots.forEach((dot, idx) => {
                dot.addEventListener('click', () => this.showRuleSlide(idx));
            });
        }

        // Swipe support on rules card slot
        if (this.rulesCardSlot) {
            let touchRulesX = 0;
            this.rulesCardSlot.addEventListener('touchstart', e => {
                touchRulesX = e.touches[0].clientX;
            }, { passive: true });

            this.rulesCardSlot.addEventListener('touchend', e => {
                const diffX = touchRulesX - e.changedTouches[0].clientX;
                if (Math.abs(diffX) > 40) {
                    if (diffX > 0 && this.currentRuleIndex < RULES_DATA.length - 1) {
                        this.showRuleSlide(this.currentRuleIndex + 1);
                    } else if (diffX < 0 && this.currentRuleIndex > 0) {
                        this.showRuleSlide(this.currentRuleIndex - 1);
                    }
                }
            }, { passive: true });
        }

        // Screen 4: Results screen buttons 
        if (this.btnClaimBonus) {
            const handleClaim = (e) => {
                if (e) {
                    try { e.preventDefault(); } catch(err) {}
                    try { e.stopPropagation(); } catch(err) {}
                }
                this.showExitScreen();
            };
            this.btnClaimBonus.onclick = handleClaim;
            this.btnClaimBonus.ontouchend = handleClaim;
            this.btnClaimBonus.addEventListener('click', handleClaim);
            this.btnClaimBonus.addEventListener('touchend', handleClaim);
            this.btnClaimBonus.addEventListener('pointerup', handleClaim);
        }

        // Screen 5: Exit button (Telegram WebApp / browser close)
        if (this.btnExitGame) {
            const handleExit = (e) => {
                if (e) {
                    try { e.preventDefault(); } catch(err) {}
                    try { e.stopPropagation(); } catch(err) {}
                }
                this.closeApp();
            };
            this.btnExitGame.onclick = handleExit;
            this.btnExitGame.ontouchend = handleExit;
            this.btnExitGame.addEventListener('click', handleExit);
            this.btnExitGame.addEventListener('touchend', handleExit);
            this.btnExitGame.addEventListener('pointerup', handleExit);
        }

        if (this.btnRetryGame) {
            this.btnRetryGame.addEventListener('click', () => {
                if (this.attemptsUsed >= this.maxAttempts) return;
                if (this.resultScreen) this.resultScreen.classList.add('hidden');
                this.startGame();
            });
        }

        // Touch & Mouse
        this.canvas.addEventListener('mousedown', e => this.onPointerDown(e));
        this.canvas.addEventListener('mousemove', e => this.onPointerMove(e));
        window.addEventListener('mouseup', () => this.onPointerUp());

        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            this.onPointerDown(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            this.onPointerMove(e);
        }, { passive: false });

        window.addEventListener('touchend', () => this.onPointerUp());
    }
}

// Launch on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Match3Game();

    // Debug hooks for automated testing
    window.addEventListener('keydown', (e) => {
        if (!window.game) return;
        if (e.key === '1') {
            window.game.score = 450;
            window.game.showResult(450, false);
        } else if (e.key === '2') {
            window.game.score = 600;
            window.game.showResult(600, false);
        } else if (e.key === '3') {
            window.game.startGame();
        } else if (e.key === '4') {
            window.game.score = 350;
            window.game.updateHUD();
        } else if (e.key === '5') {
            window.game.showToast('Поле перемешано!');
        } else if (e.key === '6') {
            window.game.spawnFloatingText('+60', window.game.level.x + 100, window.game.level.y + 100);
        } else if (e.key === '7') {
            window.game.spawnConfetti();
        } else if (e.key === '8') {
            window.game.showExitScreen();
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('testResult')) {
        const s = parseInt(urlParams.get('testResult'), 10) || 450;
        setTimeout(() => {
            if (window.game) {
                window.game.score = s;
                window.game.showResult(s, false);
            }
        }, 300);
    }

    if (urlParams.has('testExit')) {
        setTimeout(() => {
            if (window.game) {
                window.game.showExitScreen();
            }
        }, 300);
    }
});
