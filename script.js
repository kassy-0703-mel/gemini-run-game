// リファクタリング済みの完全なJavaScriptコード
document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // 1. 定数と設定 (Constants and Configuration)
    // =================================================================
    const CONFIG = {
        GRAVITY: 0.6, PLAYER_JUMP_FORCE: -15, PLAYER_WIDTH: 60, PLAYER_HEIGHT: 60,
        GAME_WIDTH: 900, GAME_HEIGHT: 500, GROUND_Y_OFFSET: 50, BASE_GAME_SPEED: 5,
        GAME_SPEED_INCREMENT: 0.003, INITIAL_TIMER: 60,
        API_BASE_URL: 'https://gemini-run-game-backend-ta6z.onrender.com',
        GAME_OVER_SEQUENCE_DURATION: 45,
    };
    const ASSET_PATHS = {
        player: 'images/player.png', obstacleLow: 'images/obstacle_low.png', obstacleHigh: 'images/obstacle_high.png',
        fallingObstacle: 'images/falling_obstacle.png', fastObstacle: 'images/fast_obstacle.png',
        itemScoreUp: 'images/item_score_up.png', itemInvincible: 'images/item_invincible.png',
        itemInvincibleEffect: 'images/item_invincible_02.png', itemSpeedUp: 'images/item_speed_up.png',
        itemJumpUp: 'images/item_jump_up.png', ground: 'images/ground.png', heart: 'images/heart.png',
        background1: 'images/background_1.png', background2: 'images/background_2.png',
        background3: 'images/background_3.png', background4: 'images/background_4.png',
    };
    const AUDIO_PATHS = {
        bgmMenu: 'audio/bgm_menu.mp3',
        bgmGame: 'audio/bgm_game.mp3',
        jump: 'audio/jump.wav',
        itemGet: 'audio/item_get.wav',
        gameOver: 'audio/game_over.wav',
        gameStart: 'audio/game_start.wav'
    };

    // =================================================================
    // 2. DOM要素の取得 (DOM Element Retrieval)
    // =================================================================
    const dom = {
        screens: { title: document.getElementById('title-screen'), game: document.getElementById('game-screen'), gameOver: document.getElementById('game-over-screen'), ranking: document.getElementById('ranking-screen'), admin: document.getElementById('admin-screen'), },
        buttons: {
            ranking: document.getElementById('ranking-button'),
            admin: document.getElementById('admin-button'),
            backToTitle: document.getElementById('back-to-title-button'),
            backToTitleFromGO: document.getElementById('back-to-title-from-gameover'),
            backToTitleFromAdmin: document.getElementById('back-to-title-from-admin'),
            resetRanking: document.getElementById('reset-ranking-button'),
            jump: document.getElementById('jump-button'),
            audioPopup: document.getElementById('audio-popup-button'),
        },
        displays: { score: document.getElementById('score-display'), timer: document.getElementById('timer-display'), finalScore: document.getElementById('final-score'), effect: document.getElementById('effect-display'), adminMessage: document.getElementById('admin-message'), },
        inputs: { playerName: document.getElementById('player-name'), adminPassword: document.getElementById('admin-password'), },
        titleImage: document.getElementById('title-image'),
        canvas: document.getElementById('game-canvas'),
        gameAreaContainer: document.getElementById('game-area-container'), // 新しいコンテナを追加
        rankingForm: document.getElementById('ranking-form'), rankingList: document.getElementById('ranking-list'),
        loadingOverlay: document.getElementById('loading-overlay'),
        audioPopup: document.getElementById('audio-popup'),
    };
    const ctx = dom.canvas.getContext('2d');

    // =================================================================
    // 3. ゲーム状態変数 (Game State Variables)
    // =================================================================
    let state = {}; let assets = {}; let audioAssets = {}; let currentBgm = null, userInteracted = false;
    let gameInterval = null, animationFrameId = null;
    let assetsLoaded = false;
    let debugInfo = {};
    let lastTime = 0; // デルタタイム計算用

    // =================================================================
    // 4. 初期化とセットアップ (Initialization and Setup)
    // =================================================================
    function main() {
        lucide.createIcons();
        setupEventListeners();
        
        Promise.all([loadAssets(), loadAudio()]).then(([assetLoadResult]) => {
            debugInfo = assetLoadResult;
            assetsLoaded = true;
            dom.loadingOverlay.style.display = 'none';
            dom.audioPopup.style.display = 'flex';
            resizeCanvas();
        }).catch(error => { 
            console.error("Asset loading failed:", error);
            debugInfo = { error: error.message };
            dom.loadingOverlay.innerHTML = '<p>アセットの読み込みに失敗しました。<br>リフレッシュしてください。</p>';
        });
    }

    function loadAssets() {
        const assetEntries = Object.entries(ASSET_PATHS);
        const loaded = [];
        const failed = [];

        const loadPromise = assetEntries.reduce((promiseChain, [key, src]) => {
            return promiseChain.then(() => new Promise(resolve => {
                const img = new Image();
                img.src = src + '?t=' + new Date().getTime();
                
                img.onload = () => {
                    if (img.naturalHeight > 0) {
                        assets[key] = img;
                        loaded.push(src.split('/').pop());
                    } else {
                        assets[key] = null;
                        failed.push(src.split('/').pop() + ' (dims=0)');
                    }
                    resolve();
                };

                img.onerror = () => {
                    assets[key] = null;
                    failed.push(src.split('/').pop() + ' (error)');
                    resolve(); 
                };
            }));
        }, Promise.resolve());

        return loadPromise.then(() => ({ loaded, failed }));
    }
    
    function loadAudio() {
        const promises = Object.entries(AUDIO_PATHS).map(([key, src]) => new Promise(resolve => {
            const audio = new Audio();
            audio.src = src;
            audioAssets[key] = audio; // 先にセットしておく

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.warn(`Audio loading timed out for: ${src}`);
                    resolved = true;
                    resolve();
                }
            }, 5000); // 5秒でタイムアウト

            const done = () => {
                if (!resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    resolve();
                }
            };
            
            // oncanplaythroughの代わりに、より早く発生するloadeddataを使う
            audio.addEventListener('loadeddata', done);
            audio.addEventListener('error', done);
        }));
        return Promise.all(promises);
    }
    
    function resetGameState() {
        const groundY = CONFIG.GAME_HEIGHT - CONFIG.GROUND_Y_OFFSET;
        state = {
            player: createPlayer(groundY), obstacles: [], items: [], visualEffects: [], afterimages: [],
            score: 0, timer: CONFIG.INITIAL_TIMER, gameSpeed: CONFIG.BASE_GAME_SPEED, baseSpeed: CONFIG.BASE_GAME_SPEED,
            frameCount: 0, backgroundScrollX: 0, groundScrollX: 0, spawnCooldown: 120,
            itemSpawnCooldown: getRandomInt(300, 500), invincibilityTimer: 0, speedUpTimer: 0, jumpUpTimer: 0,
            isGameOverSequenceActive: false, gameOverEffectTimer: 0,
            currentScreen: 'title', groundY: groundY, isSwitchingScreen: false,
            deltaTime: 0, // デルタタイムを追加
        };
    }

    // =================================================================
    // 5. ゲームの主要な流れ (Main Game Flow)
    // =================================================================
    function startGame() {
        if (!assetsLoaded) {
            alert("まだ準備中です。少し待ってからもう一度試してください。");
            return;
        }

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (gameInterval) clearInterval(gameInterval);

        playSfx(audioAssets.gameStart);
        resetGameState(); 
        switchScreen('game');
        playBgm(audioAssets.bgmGame);

        requestAnimationFrame(resizeCanvas);
        
        gameInterval = setInterval(() => {
            if (state.isGameOverSequenceActive) return;
            state.timer--;
            if (state.timer <= 0) {
                state.score += 2500; // 完走ボーナスを追加
                showEffectMessage('完走ボーナス +2500点！', 3);
                startGameOverSequence();
            }
        }, 1000);
        
        lastTime = performance.now(); // 開始時間を記録
        gameLoop();
    }

    function gameLoop(timestamp) {
        if (!timestamp) timestamp = performance.now();
        state.deltaTime = (timestamp - lastTime) / (1000 / 60); // 60FPSを基準とした経過時間の比率
        lastTime = timestamp;

        update(); 
        draw();

        if (state.currentScreen === 'game' || state.isGameOverSequenceActive) {
            animationFrameId = requestAnimationFrame(gameLoop);
        }
    }

    function startGameOverSequence() {
        if (state.isGameOverSequenceActive) return;
        
        playBgm(audioAssets.bgmMenu); 
        playSfx(audioAssets.gameOver);

        state.isGameOverSequenceActive = true;
        state.gameOverEffectTimer = CONFIG.GAME_OVER_SEQUENCE_DURATION;
        createCollisionSparks(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2);
    }

    function endGame(switchToGameOverScreen = true) {
        clearInterval(gameInterval);
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        gameInterval = null;

        if (switchToGameOverScreen) {
            dom.displays.finalScore.textContent = state.score;
            switchScreen('gameOver');
        }
    }

    // =================================================================
    // 6. ゲーム状態の更新 (Update Logic)
    // =================================================================
    function update() {
        if (state.currentScreen !== 'game' && !state.isGameOverSequenceActive) return;
        
        const dt = state.deltaTime;
        if (dt === 0 || isNaN(dt)) return; // デルタタイムが不正な場合は更新しない

        state.frameCount++;

        if (state.isGameOverSequenceActive) {
            state.gameOverEffectTimer -= dt;
            if (state.gameOverEffectTimer <= 0) endGame();
            updateEntities(state.visualEffects, 0, dt);
            return;
        }

        // 残像の生成
        if (state.speedUpTimer > 0 && state.frameCount % 4 === 0) {
            state.afterimages.push({
                x: state.player.x,
                y: state.player.y,
                life: 20, // 20フレーム持続
            });
        }

        // 残像の更新と削除
        for (let i = state.afterimages.length - 1; i >= 0; i--) {
            const afterimage = state.afterimages[i];
            afterimage.x -= state.gameSpeed * dt; // デルタタイムを適用
            afterimage.life -= dt; // デルタタイムを適用
            if (afterimage.life <= 0) {
                state.afterimages.splice(i, 1);
            }
        }

        state.backgroundScrollX -= state.gameSpeed * 0.5 * dt;
        state.groundScrollX -= state.gameSpeed * dt;
        state.baseSpeed += CONFIG.GAME_SPEED_INCREMENT * (dt / 60); // 1秒あたりで増加するように調整
        if (state.speedUpTimer <= 0) state.gameSpeed = state.baseSpeed;

        state.player.update(dt);
        updateEntities(state.obstacles, state.gameSpeed, dt);
        updateEntities(state.items, state.gameSpeed, dt);
        updateEntities(state.visualEffects, 0, dt);
        
        manageSpawning(dt);
        handleCollisions();
        updateItemEffects(dt);
        state.score += Math.round(1 * dt); // スコアもデルタタイムを考慮
    }
    
    function updateEntities(entities, speed = 0, dt) {
        for (let i = entities.length - 1; i >= 0; i--) {
            const e = entities[i];
            if (speed > 0) e.x -= speed * dt;
            if (e.update) e.update(dt);
            if (e.life) {
                e.life -= dt;
                if (e.life <= 0) {
                    entities.splice(i, 1);
                    continue;
                }
            }
            if (e.x + (e.width || 0) < 0) {
                entities.splice(i, 1);
            }
        }
    }

    // =================================================================
    // 7. 描画処理 (Drawing Logic)
    // =================================================================
    function draw() {
        ctx.save();
        if (state.isGameOverSequenceActive) {
            const shake = Math.max(0, state.gameOverEffectTimer / 3);
            ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        }

        ctx.clearRect(-50, -50, dom.canvas.width + 100, dom.canvas.height + 100);

        drawBackground();
        drawGround();

        state.items.forEach(item => item.draw());
        state.obstacles.forEach(o => o.draw());

        // 残像の描画
        ctx.save();
        state.afterimages.forEach(afterimage => {
            ctx.globalAlpha = (afterimage.life / 20) * 0.4; // 寿命に応じて透明度を変更
            if (assets.player) {
                ctx.drawImage(assets.player, afterimage.x, afterimage.y, state.player.width, state.player.height);
            }
        });
        ctx.restore();

        state.player.draw();
        state.visualEffects.forEach(e => e.draw());

        dom.displays.score.textContent = state.score;
        dom.displays.timer.textContent = state.timer;

        if (state.isGameOverSequenceActive) {
            const flashOpacity = Math.max(0, state.gameOverEffectTimer / CONFIG.GAME_OVER_SEQUENCE_DURATION) * 0.7;
            ctx.fillStyle = `rgba(255, 0, 0, ${flashOpacity})`;
            ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
        }
        
        ctx.restore();
    }

    function drawBackground() {
        const currentLoadedImages = Object.keys(ASSET_PATHS)
            .filter(k => k.startsWith('background') && assets[k] && assets[k].naturalHeight > 0)
            .map(k => assets[k]);

        if (currentLoadedImages.length > 0) {
            const widthMultiplier = 1.5;
            let totalWidth = 0;
            
            currentLoadedImages.forEach(img => {
                totalWidth += (img.width * (dom.canvas.height / img.height)) * widthMultiplier;
            });

            if (totalWidth > 0) {
                let x = state.backgroundScrollX % totalWidth;
                if (x > 0) x -= totalWidth;
                while (x < dom.canvas.width) {
                    for (const img of currentLoadedImages) {
                        const w = (img.width * (dom.canvas.height / img.height)) * widthMultiplier;
                        if (w > 0) {
                            ctx.drawImage(img, x, 0, w, dom.canvas.height);
                            x += w;
                        }
                    }
                }
            }
        }
    }

    function drawGround() {
        if (assets.ground) {
            const h = dom.canvas.height - state.groundY;
            const w = assets.ground.width * (h / assets.ground.height);
            if (w > 0) {
                let x = state.groundScrollX % w;
                if (x > 0) x -= w;
                while (x < dom.canvas.width) {
                    ctx.drawImage(assets.ground, x, state.groundY, w, h);
                    x += w;
                }
            }
        }
    }

    // =================================================================
    // 8. エンティティ、衝突、スポーン関連 (Entities, Collisions, Spawning)
    // =================================================================
    function playSfx(sfx) {
        if (sfx) {
            sfx.currentTime = 0;
            sfx.play();
        }
    }

    function createPlayer(groundY) {
        return {
            x: 50, y: groundY - CONFIG.PLAYER_HEIGHT, width: CONFIG.PLAYER_WIDTH, height: CONFIG.PLAYER_HEIGHT,
            velocityY: 0, jumpsLeft: 2, jumpForce: CONFIG.PLAYER_JUMP_FORCE,
            draw() {
                // 無敵エフェクトがアクティブな場合に描画
                if (state.invincibilityTimer > 0 && assets.itemInvincibleEffect) {
                    ctx.save();
                    const centerX = this.x + this.width / 2;
                    const centerY = this.y + this.height / 2;
                    // エフェクトのサイズを脈動させる
                    const effectSize = this.width * 1.5 + Math.sin(state.frameCount * 0.1) * 5;

                    // エフェクトを回転させる
                    ctx.translate(centerX, centerY);
                    ctx.rotate(state.frameCount * 0.05);

                    // 無敵時間が残り少なくなったら点滅させる
                    const flashAlpha = (state.invincibilityTimer < 60 && state.frameCount % 10 < 5) ? 0.3 : 0.7;
                    ctx.globalAlpha = state.invincibilityTimer > 0 ? flashAlpha : 1.0;

                    ctx.drawImage(assets.itemInvincibleEffect, -effectSize / 2, -effectSize / 2, effectSize, effectSize);
                    ctx.restore();
                }

                // プレイヤー本体の描画
                ctx.save();
                // 無敵中はプレイヤーを半透明にする
                ctx.globalAlpha = state.invincibilityTimer > 0 ? 0.6 : 1.0;
                if (assets.player) {
                    ctx.drawImage(assets.player, this.x, this.y, this.width, this.height);
                }
                ctx.restore();
            },
            update(dt) {
                this.velocityY += CONFIG.GRAVITY * dt;
                this.y += this.velocityY * dt;
                if (this.y > groundY - this.height) {
                    this.y = groundY - this.height;
                    this.velocityY = 0;
                    if (this.jumpsLeft < 2) this.jumpsLeft = 2;
                }
            },
            jump() {
                if (this.jumpsLeft > 0) {
                    this.velocityY = this.jumpForce;
                    this.jumpsLeft--;
                    playSfx(audioAssets.jump);
                    if (state.jumpUpTimer > 0) createJumpParticles(this.x + this.width / 2, this.y + this.height);
                }
            }
        };
    }

    function handleCollisions() {
        for (const obstacle of state.obstacles) {
            if (state.invincibilityTimer <= 0 && isColliding(state.player, obstacle)) {
                startGameOverSequence();
                return;
            }
        }
        for (let i = state.items.length - 1; i >= 0; i--) {
            if (isColliding(state.player, state.items[i])) {
                activateItem(state.items[i].type, state.items[i].x, state.items[i].y);
                state.items.splice(i, 1);
            }
        }
    }

    function manageSpawning(dt) {
        state.spawnCooldown -= dt;
        if (state.spawnCooldown <= 0) {
            const r = Math.random();
            if (state.timer > 40) { createObstacle('low'); state.spawnCooldown = getRandomInt(90, 120); }
            else if (state.timer > 20) {
                if (r < 0.2) createFastObstacle(); else if (r < 0.6) createObstacle('low');
                else if (r < 0.85) createObstacle('high'); else spawnPattern([{ type: 'low', delay: 0 }, { type: 'low', delay: 40 }]);
                state.spawnCooldown = getRandomInt(65, 95);
            } else {
                if (r < 0.25) createFallingObstacle(); else if (r < 0.5) createFastObstacle();
                else if (r < 0.75) spawnPattern([{ type: 'low', delay: 0 }, { type: 'high', delay: 50 }]);
                else spawnPattern([{ type: 'high', delay: 0 }, { type: 'low', delay: 60 }]);
                state.spawnCooldown = getRandomInt(50, 80);
            }
        }
        state.itemSpawnCooldown -= dt;
        if (state.itemSpawnCooldown <= 0) {
            const itemTypes = ['scoreUp', 'scoreUp', 'scoreUp', 'scoreUp', 'scoreUp', 'scoreUp', 'invincible', 'speedUp', 'jumpUp'];
            createItem(itemTypes[getRandomInt(0, itemTypes.length - 1)]);
            state.itemSpawnCooldown = getRandomInt(200, 350); // スポーン間隔を少し広げる
        }
    }
    
    function spawnPattern(pattern) {
        pattern.forEach(p => createObstacle(p.type, p.delay * state.gameSpeed));
    }

    function createObstacle(type, xOffset = 0) {
        const obstacle = {
            x: CONFIG.GAME_WIDTH + xOffset,
            draw() {
                const img = type === 'low' ? assets.obstacleLow : assets.obstacleHigh;
                if (img) ctx.drawImage(img, this.x, this.y, this.width, this.height);
            },
            update(){}
        };
        if (type === 'low') {
            obstacle.width = 45; obstacle.height = 60;
            obstacle.y = state.groundY - obstacle.height;
        } else {
            obstacle.width = 90; obstacle.height = 120;
            obstacle.y = state.groundY - obstacle.height;
        }
        state.obstacles.push(obstacle);
    }

    function createFallingObstacle() {
        state.obstacles.push({
            x: getRandomInt(CONFIG.GAME_WIDTH, CONFIG.GAME_WIDTH * 1.5), y: -30, width: 48.75, height: 48.75, vy: 4,
            update(dt) { this.y += this.vy * dt; },
            draw() { if (assets.fallingObstacle) ctx.drawImage(assets.fallingObstacle, this.x, this.y, this.width, this.height); }
        });
    }

    function createFastObstacle() {
        state.obstacles.push({
            x: CONFIG.GAME_WIDTH, y: state.groundY - 67.5, width: 112.5, height: 67.5, vx: -4,
            update(dt) { this.x += this.vx * dt; },
            draw() { if (assets.fastObstacle) ctx.drawImage(assets.fastObstacle, this.x, this.y, this.width, this.height); }
        });
    }

    function createItem(type) {
        const MAX_ATTEMPTS = 10;
        let item = null;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const potentialItem = {
                x: CONFIG.GAME_WIDTH + getRandomInt(0, 200),
                y: getRandomInt(state.groundY - 200, state.groundY - 80),
                width: 45, height: 45, type: type,
            };

            let isSafe = true;
            const safetyZone = {
                x: potentialItem.x - 50,
                y: potentialItem.y - 50,
                width: potentialItem.width + 100,
                height: potentialItem.height + 100,
            };

            for (const obstacle of state.obstacles) {
                if (obstacle.x > CONFIG.GAME_WIDTH * 2) continue;
                
                if (isColliding(safetyZone, obstacle)) {
                    isSafe = false;
                    break;
                }
            }

            if (isSafe) {
                item = potentialItem;
                break;
            }
        }

        if (!item) {
            return; 
        }
        
        item.draw = function() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            ctx.save();
            const glowStrength = (Math.sin(state.frameCount * 0.05) + 1) / 2;
            let glowColorBase = '', maxRadiusOffset = 15;
            switch(this.type) {
                case 'scoreUp': glowColorBase = '255, 215, 0'; break;
                case 'invincible': glowColorBase = '0, 191, 255'; maxRadiusOffset = 18; break;
                case 'speedUp': glowColorBase = '50, 205, 50'; break;
                case 'jumpUp': glowColorBase = '255, 105, 180'; break;
            }
            for (let i = 0; i < 3; i++) {
                const currentRadius = (this.width / 2) + (glowStrength * maxRadiusOffset * (1 - i * 0.2));
                ctx.fillStyle = `rgba(${glowColorBase}, ${(0.4 - i * 0.1) * glowStrength})`;
                ctx.beginPath(); ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
            let img = null;
            switch(this.type) {
                case 'scoreUp': img = assets.itemScoreUp; break;
                case 'invincible': img = assets.itemInvincible; break;
                case 'speedUp': img = assets.itemSpeedUp; break;
                case 'jumpUp': img = assets.itemJumpUp; break;
            }
            if (img) ctx.drawImage(img, this.x, this.y, this.width, this.height);
            if (this.type === 'scoreUp' && this.floatingHearts) {
                this.floatingHearts.forEach(heart => {
                    const heartX = centerX + Math.cos(heart.angle) * heart.radius;
                    const heartY = centerY + Math.sin(heart.angle) * heart.radius;
                    if (assets.heart) ctx.drawImage(assets.heart, heartX - heart.size / 2, heartY - heart.size / 2, heart.size, heart.size);
                    heart.angle += heart.speed;
                });
            }
        };

        if (type === 'scoreUp') {
            item.floatingHearts = [];
            for (let i = 0; i < 3; i++) {
                item.floatingHearts.push({
                    angle: Math.random() * Math.PI * 2, radius: getRandomInt(30, 40),
                    size: getRandomInt(15, 25), speed: (Math.random() * 0.02 + 0.01) * (Math.random() < 0.5 ? 1 : -1)
                });
            }
        }
        state.items.push(item);
    }

    function activateItem(type, x, y) {
        playSfx(audioAssets.itemGet);
        switch(type) {
            case 'scoreUp':
                state.score += 500;
                showEffectMessage('ちあき♡ GET！', 2);
                createScoreEffect(x, y);
                break;
            case 'invincible':
                state.invincibilityTimer = 300;
                showEffectMessage('ラーメン！', 5);
                break;
            case 'speedUp':
                if (state.speedUpTimer <= 0) state.gameSpeed = state.baseSpeed * 1.5;
                state.speedUpTimer = 420;
                showEffectMessage('ギター！', 7);
                createSpeedUpEffect(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2);
                break;
            case 'jumpUp':
                state.player.jumpForce = CONFIG.PLAYER_JUMP_FORCE * 1.3;
                state.jumpUpTimer = 600;
                showEffectMessage('お酒！', 10);
                createJumpUpItemEffect(state.player.x + state.player.width / 2, state.player.y + state.player.height);
                break;
        }
    }

    // =================================================================
    // 9. エフェクトとUI (Effects and UI)
    // =================================================================
    function updateItemEffects(dt) {
        let effectMessage = '';
        if (state.invincibilityTimer > 0) {
            state.invincibilityTimer -= dt;
            effectMessage = `無敵！ 残り ${Math.ceil(state.invincibilityTimer / 60)} 秒`;
            if (state.invincibilityTimer <= 0) {
                state.invincibilityTimer = 0;
                showEffectMessage('ラーメン終了', 2);
            }
        }
        if (state.speedUpTimer > 0) {
            state.speedUpTimer -= dt;
            effectMessage = `移動速度アップ！ 残り ${Math.ceil(state.speedUpTimer / 60)} 秒`;
            if (state.speedUpTimer <= 0) {
                state.speedUpTimer = 0;
                state.gameSpeed = state.baseSpeed; 
                showEffectMessage('ギター終了', 2); 
            }
        }
        if (state.jumpUpTimer > 0) {
            state.jumpUpTimer -= dt;
            effectMessage = `ジャンプ力アップ！ 残り ${Math.ceil(state.jumpUpTimer / 60)} 秒`;
            if (state.jumpUpTimer <= 0) {
                state.jumpUpTimer = 0;
                state.player.jumpForce = CONFIG.PLAYER_JUMP_FORCE; 
                showEffectMessage('お酒終了', 2); 
            }
        }
        if (effectMessage) {
            dom.displays.effect.textContent = effectMessage;
            dom.displays.effect.classList.remove('opacity-0');
        } else if (!dom.displays.effect.dataset.temp) {
            dom.displays.effect.classList.add('opacity-0');
        }
    }

    function showEffectMessage(message, durationInSeconds) {
        dom.displays.effect.textContent = message;
        dom.displays.effect.classList.remove('opacity-0');
        dom.displays.effect.dataset.temp = 'true';
        setTimeout(() => {
            if (state.invincibilityTimer <= 0 && state.speedUpTimer <= 0 && state.jumpUpTimer <= 0) {
                 dom.displays.effect.classList.add('opacity-0');
            }
            delete dom.displays.effect.dataset.temp;
        }, durationInSeconds * 1000);
    }

    function createParticle(x, y, options = {}) {
        const { color = 'gold', size = 15, life = 60, vx = (Math.random() - 0.5) * 4, vy = (Math.random() - 0.5) * 4, gravity = 0.1, image = null } = options;
        state.visualEffects.push({
            life, image, x, y, vx, vy, size, color, gravity,
            update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy += this.gravity * dt; },
            draw() {
                ctx.globalAlpha = Math.max(0, this.life / 60);
                if (this.image) { ctx.drawImage(this.image, this.x, this.y, this.size, this.size); }
                else { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2); ctx.fill(); }
            }
        });
    }

    function createTextEffect(x, y, text, options = {}) {
        const { color = 'white', size = 20, life = 60, vy = -1 } = options;
        state.visualEffects.push({
            life, text, x, y, vy, color, size,
            update(dt) { this.y += this.vy * dt; },
            draw() {
                ctx.globalAlpha = Math.max(0, this.life / 60);
                ctx.fillStyle = this.color;
                ctx.font = `${this.size}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(this.text, this.x, this.y);
            }
        });
    }
    
    function createCollisionSparks(x, y) {
        for (let i = 0; i < 30; i++) createParticle(x, y, { color: `rgb(255, ${getRandomInt(100, 200)}, 0)`, size: getRandomInt(3, 8), life: getRandomInt(20, 40), vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, gravity: 0.2 });
    }

    function createScoreEffect(x, y) {
        createTextEffect(x, y, '+500', { color: 'gold', size: 24, life: 80, vy: -1.5 });
        for (let i = 0; i < 15; i++) createParticle(x, y, { image: assets.heart, size: getRandomInt(15, 25), life: getRandomInt(40, 70) });
    }

    function createJumpParticles(x, y) {
        for (let i = 0; i < 10; i++) createParticle(x, y, { color: 'hotpink', size: getRandomInt(5, 15), life: getRandomInt(30, 50), vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 2, gravity: 0.2 });
    }

    function createSpeedUpEffect(x, y) {
        for (let i = 0; i < 20; i++) createParticle(x, y, { color: 'limegreen', size: getRandomInt(5, 10), life: getRandomInt(20, 40), vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, gravity: 0 });
    }

    function createJumpUpItemEffect(x, y) {
        for (let i = 0; i < 15; i++) createParticle(x, y, { color: 'hotpink', size: getRandomInt(8, 18), life: getRandomInt(40, 60), vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 7 - 3, gravity: 0.1 });
    }

    function animateFinalScore(finalScore) {
        const scoreElement = dom.displays.finalScore;
        let currentScore = 0;
        const duration = 1200;
        const frameRate = 60;
        const totalFrames = duration / (1000 / frameRate);
        const increment = finalScore / totalFrames;
        
        function updateScore() {
            currentScore += increment;
            if (currentScore >= finalScore) {
                scoreElement.textContent = finalScore;
            } else {
                scoreElement.textContent = Math.floor(currentScore);
                requestAnimationFrame(updateScore);
            }
        }
        updateScore();
    }

    // =================================================================
    // 10. ユーティリティとAPI (Utilities and API)
    // =================================================================
    function playBgm(bgm) {
        if (!userInteracted || !bgm) return;
        if (currentBgm === bgm && !currentBgm.paused) return;
        if (currentBgm) {
            currentBgm.pause();
            currentBgm.currentTime = 0;
        }
        currentBgm = bgm;
        if (currentBgm) {
            currentBgm.loop = true;
            currentBgm.volume = 0.3;
            const playPromise = currentBgm.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.log("BGM autoplay was prevented by the browser.");
                });
            }
        }
    }

    function switchScreen(screenName) {
        state.currentScreen = screenName;
        Object.values(dom.screens).forEach(s => s.classList.remove('active'));
        if (dom.screens[screenName]) {
            dom.screens[screenName].classList.add('active');
        }

        // ゲーム画面のと��だけスクロールを禁止し、それ以外（タイトル等）では許可する
        if (screenName === 'game') {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
    }
    function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function isColliding(rect1, rect2) { return rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y; }
    function resizeCanvas() {
        const gameScreen = dom.screens.game;
        if (!gameScreen || gameScreen.clientWidth === 0) return;

        // 画面全体の利用可能な幅と高さを取得
        const availableWidth = gameScreen.clientWidth;
        let availableHeight = window.innerHeight;

        // キャンバス以外のUI要素の高さを取得して、利用可能な高さから引いていく
        const hud = gameScreen.querySelector('.game-hud');
        const jumpText = gameScreen.querySelector('.mt-2.text-gray-600');
        const jumpButton = dom.buttons.jump;
        const itemDesc = gameScreen.querySelector('.mt-4.p-4');
        
        // #game-screenの上下padding (1rem * 2 = 32px)
        const screenPadding = 32; 
        availableHeight -= screenPadding;

        // 各UI要素の高さを引く
        if (hud) availableHeight -= hud.offsetHeight;
        if (jumpText) availableHeight -= jumpText.offsetHeight;
        if (jumpButton) availableHeight -= jumpButton.offsetHeight;
        if (itemDesc) availableHeight -= itemDesc.offsetHeight;

        // 要素間のマージン(mt-2, mt-4など)も引く
        availableHeight -= (8 + 16 + 16); // テキストの上、ボタンの上、説明の上のマージン

        // 計算後の高さが小さくなりすぎないように最小値を保証
        availableHeight = Math.max(availableHeight, 200);

        // アスペクト比を保ったままスケールを計算
        const scale = Math.min(
            availableWidth / CONFIG.GAME_WIDTH,
            availableHeight / CONFIG.GAME_HEIGHT
        );

        const displayWidth = CONFIG.GAME_WIDTH * scale;
        const displayHeight = CONFIG.GAME_HEIGHT * scale;

        // Canvasの内部解像度と表示サイズを設定
        dom.canvas.width = CONFIG.GAME_WIDTH;
        dom.canvas.height = CONFIG.GAME_HEIGHT;
        dom.canvas.style.width = `${displayWidth}px`;
        dom.canvas.style.height = `${displayHeight}px`;

        // プレイヤーが地面の下に埋まらないように再配置
        if (state.groundY && state.player) {
            if (state.player.y + state.player.height > state.groundY) {
                state.player.y = state.groundY - state.player.height;
            }
        }
    }
    
    async function getRankings() {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/rankings`);
            if (!response.ok) {
                throw new Error(`ランキングの取得に失敗しました。 Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in getRankings:', error);
            throw error; // エラーを呼び出し元に再スローする
        }
    }
    async function saveRanking(playerName, playerScore) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/rankings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName, score: playerScore }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`ランキングの保存に失敗しました。 Status: ${response.status}, Body: ${errorText}`);
            }
        } catch (error) {
            console.error('Error in saveRanking:', error);
            throw error; // エラーを呼び出し元に再スローする
        }
    }
    async function displayRankings() {
        const rankings = await getRankings();
        dom.rankingList.innerHTML = rankings.length === 0 ? '<li>まだ誰もプレイしていません！</li>' :
            rankings.map((r, index) => `
                <li class="flex justify-between p-2 rounded ${index % 2 === 0 ? 'bg-gray-100' : ''}">
                    <span>${index + 1}. ${r.name}</span>
                    <span class="font-bold">${r.score}</span>
                </li>
            `).join('');
    }

    // =================================================================
    // 11. イベントリスナーとメイン実行 (Event Listeners & Main Execution)
    // =================================================================
    function handleInput(e) {
        if (state.currentScreen === 'game' && !state.isGameOverSequenceActive) {
            e.preventDefault();
            state.player.jump();

            // ボタンアニメーションのトリガー
            dom.buttons.jump.classList.add('active-animation');
            setTimeout(() => {
                dom.buttons.jump.classList.remove('active-animation');
            }, 100);
        }
    }

    async function handleRankingSubmit(e) {
        e.preventDefault();
        const playerName = dom.inputs.playerName.value.trim();
        if (!playerName) return;

        const submitButton = dom.rankingForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = '登録中...';

        try {
            await saveRanking(playerName, state.score);
            dom.inputs.playerName.value = '';
            
            await displayRankings();
            switchScreen('ranking');
            playBgm(audioAssets.bgmMenu);

        } catch (error) {
            console.error("Ranking submission process failed:", error);
            alert("エラーが発生しました。ランキングの登録に失敗した可能性があります。");
            // エラーが起きても、finallyブロックでボタンは元に戻ります
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'ランキングに登録';
        }
    }

    async function handleRankingReset() {
        const password = dom.inputs.adminPassword.value;
        dom.displays.adminMessage.textContent = 'リセット中...';
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/rankings/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await response.json();
            dom.displays.adminMessage.textContent = response.ok ? 'ランキングがリセットされました！' : `エラー: ${data.error || '失敗'}`;
            if (response.ok) dom.inputs.adminPassword.value = '';
        } catch (error) {
            dom.displays.adminMessage.textContent = 'エラー: サーバーに接続できませんでした。';
        }
    }

    function setupEventListeners() {
        dom.buttons.audioPopup.addEventListener('click', () => {
            if (userInteracted) return;
            userInteracted = true;
            dom.audioPopup.style.display = 'none';
            switchScreen('title');
            playBgm(audioAssets.bgmMenu);
        }, { once: true });

        dom.titleImage.addEventListener('click', startGame);
        
        const gameScreen = dom.screens.game;
        gameScreen.addEventListener('mousedown', handleInput);
        gameScreen.addEventListener('touchstart', handleInput, { passive: false });
        window.addEventListener('keydown', (e) => { if (e.code === 'Space') handleInput(e); });
        
        // ジャンプボタンのイベントリスナーを mousedown と touchstart に変更
        dom.buttons.jump.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            handleInput(e);
        });
        dom.buttons.jump.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            handleInput(e);
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (state.currentScreen === 'game') {
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('resize', resizeCanvas);
        dom.buttons.ranking.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            switchScreen('ranking'); 
            playBgm(audioAssets.bgmMenu);
            displayRankings(); 
        });
        dom.buttons.admin.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            switchScreen('admin');
            playBgm(audioAssets.bgmMenu);
        });
        
        const backToTitleAction = () => {
            endGame(false);
            resetGameState();
            switchScreen('title');
            playBgm(audioAssets.bgmMenu);
        };

        dom.buttons.backToTitle.addEventListener('click', backToTitleAction);
        dom.buttons.backToTitleFromGO.addEventListener('click', backToTitleAction);
        
        dom.buttons.backToTitleFromAdmin.addEventListener('click', () => {
            dom.displays.adminMessage.textContent = '';
            dom.inputs.adminPassword.value = '';
            backToTitleAction();
        });

        dom.rankingForm.addEventListener('submit', handleRankingSubmit);
        dom.buttons.resetRanking.addEventListener('click', handleRankingReset);
    }

    main();
});