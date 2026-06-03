(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const stageChip = document.getElementById("stageChip");
  const waitMeter = document.getElementById("waitMeter");
  const moodMeter = document.getElementById("moodMeter");
  const sleepMeter = document.getElementById("sleepMeter");
  const speaker = document.getElementById("speaker");
  const message = document.getElementById("message");
  const leftButton = document.getElementById("leftButton");
  const rightButton = document.getElementById("rightButton");
  const actionButton = document.getElementById("actionButton");
  const musicButton = document.getElementById("musicButton");
  const helpButton = document.getElementById("helpButton");
  const closeHelpButton = document.getElementById("closeHelpButton");
  const helpOverlay = document.getElementById("helpOverlay");

  const W = canvas.width;
  const H = canvas.height;
  const TAU = Math.PI * 2;
  const laneXs = [330, 480, 630];
  const familyColors = ["#ef476f", "#ffd166", "#25c2a0", "#8ecae6"];
  const stages = {
    title: "出発前",
    drive: "夜の高速",
    nap: "深夜ホテル",
    queue: "早朝の列",
    locker: "ロッカー事件",
    finale: "結果発表"
  };
  const modes = {
    normal: {
      label: "攻略モード",
      detail: "開始時の待ち時間はランダム。正確な分数は最後まで非表示。"
    },
    replay: {
      label: "再現モード",
      detail: "100分前後から始めて、伝説のロッカー事件を狙う。"
    }
  };
  const aimOrder = ["insert", "returnSlot", "keyhole", "lockerDoor"];
  const aimNames = {
    insert: "投入口",
    returnSlot: "返却口",
    keyhole: "鍵穴",
    lockerDoor: "空きロッカー"
  };
  const musicPatterns = {
    title: [392, 0, 494, 0, 523, 0, 494, 0],
    drive: [220, 277, 330, 277, 247, 294, 349, 294],
    nap: [196, 0, 247, 0, 262, 0, 247, 0],
    queue: [330, 392, 440, 392, 349, 440, 494, 440],
    locker: [247, 0, 262, 0, 294, 0, 262, 196],
    finale: [392, 494, 523, 587, 523, 494, 392, 0]
  };
  const audioState = {
    context: null,
    master: null,
    enabled: false,
    userMuted: false,
    timer: null,
    step: 0
  };

  const game = {
    scene: "title",
    sceneTime: 0,
    mode: "normal",
    waitStart: 100,
    wait: 100,
    waitRevealed: false,
    anger: 0,
    sleep: 80,
    panic: 8,
    laugh: 0,
    lane: 1,
    driveProgress: 0,
    objects: [],
    particles: [],
    spawnTimer: 0.8,
    focusCooldown: 0,
    napPhase: 0,
    napResult: "",
    queuePhase: 0,
    queueAttempts: 0,
    queueHits: 0,
    locker: makeLockerState(),
    pending: null,
    finalTitle: "",
    finalText: "",
    achievements: []
  };

  function makeLockerState() {
    return {
      elapsed: 0,
      deposited: 0,
      wrong: 0,
      miss: 0,
      lockersChecked: 0,
      nextWaitTick: 4.5,
      nextDadPrompt: 7,
      hit200: false,
      aimIndex: 0,
      successUnderPanic: false,
      lastCoin: null
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(randomBetween(min, max + 1));
  }

  function setDialogue(name, text) {
    speaker.textContent = name;
    message.textContent = text;
  }

  function updateMusicButton() {
    if (!musicButton) return;
    musicButton.setAttribute("aria-pressed", audioState.enabled ? "true" : "false");
    if (musicButton.classList) musicButton.classList.toggle("is-active", audioState.enabled);
    musicButton.textContent = audioState.enabled ? "♪" : "♪";
    musicButton.title = audioState.enabled ? "音楽を止める" : "音楽を鳴らす";
  }

  function ensureAudio() {
    if (audioState.context) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audioState.context = new AudioContextClass();
    audioState.master = audioState.context.createGain();
    audioState.master.gain.value = 0.135;
    audioState.master.connect(audioState.context.destination);
    return true;
  }

  async function toggleMusic() {
    if (!ensureAudio()) {
      setDialogue("ナレーション", "このブラウザでは音楽再生に対応していないようです。");
      return;
    }
    if (audioState.context.state === "suspended") {
      await audioState.context.resume();
    }
    audioState.enabled = !audioState.enabled;
    audioState.userMuted = !audioState.enabled;
    if (audioState.enabled) startMusic();
    else stopMusic();
    updateMusicButton();
  }

  async function startMusicFromGesture() {
    if (audioState.enabled || audioState.userMuted) return;
    if (!ensureAudio()) return;
    if (audioState.context.state === "suspended") {
      await audioState.context.resume();
    }
    audioState.enabled = true;
    startMusic();
    updateMusicButton();
  }

  function startMusic() {
    stopMusic(false);
    audioState.step = 0;
    playMusicStep();
    audioState.timer = window.setInterval(playMusicStep, 260);
  }

  function stopMusic(markDisabled = true) {
    if (audioState.timer) {
      window.clearInterval(audioState.timer);
      audioState.timer = null;
    }
    if (markDisabled) {
      audioState.enabled = false;
      updateMusicButton();
    }
  }

  function playTone(freq, duration = 0.18, type = "sine", volume = 0.45, delay = 0) {
    if (!audioState.enabled || !audioState.context || !audioState.master || !freq) return;
    const now = audioState.context.currentTime + delay;
    const osc = audioState.context.createOscillator();
    const gain = audioState.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioState.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function playMusicStep() {
    if (!audioState.enabled) return;
    const pattern = musicPatterns[game.scene] || musicPatterns.title;
    const note = pattern[audioState.step % pattern.length];
    const wave = game.scene === "drive" || game.scene === "locker" ? "square" : "triangle";
    const volume = game.scene === "locker" ? 0.34 : 0.25;
    if (note) playTone(note, 0.17, wave, volume);
    if (audioState.step % 4 === 0) playTone(note ? note / 2 : 196, 0.22, "sine", 0.2);
    audioState.step += 1;
  }

  function playSfx(kind) {
    if (!audioState.enabled) return;
    if (kind === "insert") {
      playTone(660, 0.09, "triangle", 0.5);
      playTone(880, 0.11, "triangle", 0.42, 0.08);
    }
    if (kind === "return") {
      playTone(520, 0.08, "square", 0.42);
      playTone(390, 0.1, "square", 0.34, 0.08);
    }
    if (kind === "miss") {
      playTone(170, 0.12, "sawtooth", 0.3);
    }
    if (kind === "move") {
      playTone(330, 0.06, "triangle", 0.22);
    }
    if (kind === "clear") {
      playTone(523, 0.1, "triangle", 0.45);
      playTone(659, 0.1, "triangle", 0.45, 0.1);
      playTone(784, 0.18, "triangle", 0.42, 0.2);
    }
  }

  function openHelp() {
    helpOverlay.hidden = false;
  }

  function closeHelp() {
    helpOverlay.hidden = true;
  }

  function resetRun() {
    const start = game.mode === "replay" ? randomInt(96, 106) : randomInt(80, 140);
    game.waitStart = start;
    game.wait = start;
    game.waitRevealed = false;
    game.anger = game.mode === "replay" ? 6 : 0;
    game.sleep = 80;
    game.panic = game.mode === "replay" ? 12 : 8;
    game.laugh = 0;
    game.lane = 1;
    game.driveProgress = 0;
    game.objects = [];
    game.particles = [];
    game.spawnTimer = 0.8;
    game.focusCooldown = 0;
    game.napPhase = 0;
    game.napResult = "";
    game.queuePhase = 0;
    game.queueAttempts = 0;
    game.queueHits = 0;
    game.locker = makeLockerState();
    game.pending = null;
    game.finalTitle = "";
    game.finalText = "";
    game.achievements = [];
  }

  function setScene(scene) {
    game.scene = scene;
    game.sceneTime = 0;
    game.pending = null;

    if (scene === "title") {
      resetRun();
      setDialogue("ナレーション", "神奈川から大阪へ。朝イチを狙う家族旅行が始まる。");
    }

    if (scene === "drive") {
      setDialogue("パパ", "出発だ。夜通し走って、ホテルで少しだけ寝るぞ。");
    }

    if (scene === "nap") {
      setDialogue("ナレーション", "ホテルに深夜到着。仮眠は短いが、朝イチの列が待っている。");
    }

    if (scene === "queue") {
      setDialogue("子ども", "前の方に並べた！ 最初のアトラクション、いけそう！");
    }

    if (scene === "locker") {
      game.panic = clamp(game.panic + 14, 0, 100);
      game.sleep = clamp(game.sleep + 4, 0, 100);
      setDialogue("ママ", "みんな先に並んでて。荷物をロッカーに入れたらすぐ戻るね。");
    }

    if (scene === "finale") {
      finishStory();
    }

    if (audioState.enabled) {
      audioState.step = 0;
      playMusicStep();
    }
    updateControls();
    updateHud();
  }

  function scheduleScene(scene, delay) {
    game.pending = { scene, delay };
    updateControls();
  }

  function setMode(mode) {
    game.mode = mode;
    resetRun();
    setDialogue("ナレーション", `${modes[mode].label}を選択。${modes[mode].detail}`);
    updateControls();
    updateHud();
  }

  function crowdLabel(value = game.wait) {
    if (game.waitRevealed || game.scene === "finale") return `${Math.round(value)}分`;
    if (value < 92) return "空いてる気配";
    if (value < 115) return "朝イチ感";
    if (value < 140) return "じわ混み";
    if (value < 165) return "列が伸びた";
    if (value < 190) return "かなり混雑";
    return "危険な気配";
  }

  function moodText() {
    if (game.scene === "finale" && game.laugh >= 70) return "大爆笑";
    if (game.anger >= 88) return "激おこ";
    if (game.anger >= 62) return "眉間が深い";
    if (game.anger >= 30) return "そわそわ";
    return "わくわく";
  }

  function statusText() {
    if (game.scene === "locker") return `焦り${Math.round(game.panic)}%`;
    if (game.scene === "queue") return `前方${game.queueHits}/6`;
    return `眠気${Math.round(game.sleep)}%`;
  }

  function updateHud() {
    stageChip.textContent = stages[game.scene] || "進行中";
    waitMeter.textContent = crowdLabel();
    moodMeter.textContent = moodText();
    sleepMeter.textContent = statusText();
  }

  function setButton(button, text, disabled) {
    button.textContent = text;
    button.disabled = disabled;
  }

  function updateControls() {
    const locked = Boolean(game.pending);

    if (game.scene === "title") {
      setButton(leftButton, "攻略", false);
      setButton(actionButton, `${modes[game.mode].label}開始`, false);
      setButton(rightButton, "再現", false);
      return;
    }

    if (game.scene === "drive") {
      setButton(leftButton, "←", false);
      setButton(actionButton, "ライト", locked || game.focusCooldown > 0);
      setButton(rightButton, "→", false);
      return;
    }

    if (game.scene === "nap") {
      setButton(leftButton, "←", true);
      setButton(actionButton, locked ? "起床中" : "アラーム", locked);
      setButton(rightButton, "→", true);
      return;
    }

    if (game.scene === "queue") {
      setButton(leftButton, "←", true);
      setButton(actionButton, locked ? "移動中" : "前へ", locked);
      setButton(rightButton, "→", true);
      return;
    }

    if (game.scene === "locker") {
      setButton(leftButton, "深呼吸", locked);
      setButton(actionButton, "投入", locked);
      setButton(rightButton, "狙い変更", locked);
      return;
    }

    if (game.scene === "finale") {
      setButton(leftButton, "攻略", false);
      setButton(actionButton, "もう一度", false);
      setButton(rightButton, "再現", false);
    }
  }

  function moveLane(dir) {
    if (game.scene !== "drive" || game.pending) return;
    game.lane = clamp(game.lane + dir, 0, laneXs.length - 1);
    playSfx("move");
  }

  function handleAction() {
    if (game.pending) return;
    startMusicFromGesture();

    if (game.scene === "title") {
      resetRun();
      setScene("drive");
      return;
    }

    if (game.scene === "drive") {
      if (game.focusCooldown <= 0) {
        game.sleep = clamp(game.sleep + 7, 0, 100);
        game.focusCooldown = 2.2;
        setDialogue("パパ", "ライトよし、眠気も少し戻った。あと少し走ろう。");
      }
      return;
    }

    if (game.scene === "nap") {
      stopAlarm();
      return;
    }

    if (game.scene === "queue") {
      stepQueue();
      return;
    }

    if (game.scene === "locker") {
      attemptCoin();
      return;
    }

    if (game.scene === "finale") {
      setScene("title");
    }
  }

  function stopAlarm() {
    const marker = game.napPhase % 1;
    const distance = Math.abs(marker - 0.51);

    if (distance < 0.045) {
      game.sleep = clamp(game.sleep + 22, 0, 100);
      game.panic = clamp(game.panic - 3, 0, 100);
      game.napResult = "すぱっと起床";
      setDialogue("ナレーション", "短い仮眠からきれいに起きた。家族の朝はまだ勝っている。");
    } else if (distance < 0.11) {
      game.sleep = clamp(game.sleep + 8, 0, 100);
      advanceWait(5);
      game.anger += 3;
      game.panic += 4;
      game.napResult = "ぎりぎり起床";
      setDialogue("ナレーション", "少し寝ぼけたが、まだ前方の列を狙える。");
    } else {
      game.sleep = clamp(game.sleep - 8, 0, 100);
      advanceWait(15);
      game.anger += 8;
      game.panic += 8;
      game.napResult = "寝ぼけ起床";
      setDialogue("ママ", "いま何時？ え、もう朝？ 急ごう急ごう！");
    }

    scheduleScene("queue", 1.35);
  }

  function stepQueue() {
    const marker = game.queuePhase % 1;
    const good = marker >= 0.43 && marker <= 0.57;
    const great = marker >= 0.49 && marker <= 0.52;
    game.queueAttempts += 1;

    if (good) {
      game.queueHits += 1;
      game.wait = clamp(game.wait - (great ? 5 : 2), 75, 200);
      setDialogue("子ども", great ? "すごい、するっと前へ進めた！" : "よし、列の流れに乗れた！");
    } else {
      advanceWait(8);
      game.anger = clamp(game.anger + 6, 0, 100);
      game.panic = clamp(game.panic + 4, 0, 100);
      setDialogue("パパ", "列が動いたぞ。ここは置いていかれたくないな。");
    }

    if (game.queueAttempts >= 6) {
      scheduleScene("locker", 1.05);
    }
  }

  function advanceWait(amount) {
    game.wait = clamp(game.wait + amount, 75, 200);
    if (game.wait >= 200 && !game.locker.hit200) {
      game.locker.hit200 = true;
      game.anger = clamp(game.anger + 9, 0, 100);
    }
  }

  function currentAim() {
    return aimOrder[game.locker.aimIndex];
  }

  function cycleAim() {
    if (game.scene !== "locker" || game.pending) return;
    game.locker.aimIndex = (game.locker.aimIndex + 1) % aimOrder.length;
    game.panic = clamp(game.panic + 2, 0, 100);
    playSfx("move");
    setDialogue("ママ", `狙いを「${aimNames[currentAim()]}」に合わせた。手が少し震えている。`);
  }

  function breathe() {
    if (game.scene !== "locker" || game.pending) return;
    game.panic = clamp(game.panic - 24, 0, 100);
    game.sleep = clamp(game.sleep + 2, 0, 100);
    game.anger = clamp(game.anger + 3, 0, 100);
    advanceWait(3);
    game.locker.elapsed += 1.8;
    playSfx("move");
    setDialogue("ママ", "すー、はー。少し落ち着いた。でも列は待ってくれない。");
  }

  function lockerHitboxes() {
    return {
      insert: { x: 558, y: 205, w: 122, h: 32 },
      returnSlot: { x: 532, y: 318, w: 174, h: 52 },
      keyhole: { x: 606, y: 252, w: 28, h: 42 },
      lockerDoor: { x: 118, y: 196, w: 236, h: 148 }
    };
  }

  function boxCenter(box) {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }

  function aimTarget() {
    const boxes = lockerHitboxes();
    return boxCenter(boxes[currentAim()]);
  }

  function tremorAmount() {
    const pressure = Math.max(0, game.wait - game.waitStart);
    return 4 + game.panic * 0.38 + game.locker.wrong * 2.6 + pressure * 0.06;
  }

  function handPoint() {
    const target = aimTarget();
    const shake = tremorAmount();
    const t = game.sceneTime * (4.2 + game.panic / 25);
    return {
      x: target.x + Math.sin(t * 1.4) * shake + Math.sin(t * 3.1) * shake * 0.32,
      y: target.y + Math.cos(t * 1.8) * shake * 0.72
    };
  }

  function attemptCoin() {
    if (game.scene !== "locker" || game.pending) return;
    const boxes = lockerHitboxes();
    const hand = handPoint();
    const spread = tremorAmount() * randomBetween(0.35, 0.95);
    const point = {
      x: hand.x + randomBetween(-spread, spread),
      y: hand.y + randomBetween(-spread, spread)
    };

    game.locker.lastCoin = point;

    if (pointInBox(point, boxes.insert)) {
      insertCoin(point);
      return;
    }

    if (pointInBox(point, boxes.returnSlot)) {
      returnCoin(point);
      return;
    }

    if (pointInBox(point, boxes.keyhole)) {
      jamKeyhole(point);
      return;
    }

    if (pointInBox(point, boxes.lockerDoor)) {
      checkLockerDoor(point);
      return;
    }

    dropCoin(point);
  }

  function insertCoin(point) {
    game.locker.deposited += 1;
    game.sleep = clamp(game.sleep - 1, 0, 100);
    game.panic = clamp(game.panic - 5, 0, 100);
    if (game.panic >= 70) game.locker.successUnderPanic = true;
    addCoinParticle(point.x, point.y, "#25c2a0", false);
    playSfx("insert");

    if (game.locker.wrong >= 3) {
      setDialogue("ママ", "あっ、こっちが投入口だった！ みんな待ってる、急がなきゃ！");
    } else if (game.locker.wrong === 0 && game.locker.miss === 0) {
      setDialogue("ママ", "入った！ このまま落ち着いて、あと少し。");
    } else {
      setDialogue("ママ", "よかった、やっと反応した。手が震えるけど入れられる！");
    }

    if (game.locker.deposited >= 5) {
      playSfx("clear");
      scheduleScene("finale", 1.1);
    }
  }

  function returnCoin(point) {
    game.locker.wrong += 1;
    game.anger = clamp(game.anger + 16, 0, 100);
    game.sleep = clamp(game.sleep - 2, 0, 100);
    game.panic = clamp(game.panic + 19, 0, 100);
    addCoinParticle(point.x, point.y, "#ffd166", true);

    if (game.locker.wrong >= 4) {
      advanceWait(200);
    } else {
      advanceWait(14 + game.locker.wrong * 5);
    }

    if (game.locker.wrong === 1) {
      playSfx("return");
      setDialogue("ママ", "ちゃりん。あれ、ロッカーが反応しない。もう一枚かな。");
    } else if (game.locker.wrong === 2) {
      playSfx("return");
      setDialogue("ママ", "ちゃりん、ちゃりん。壊れてる？ 別のロッカーも見てみよう。");
    } else if (game.locker.wrong === 3) {
      playSfx("return");
      setDialogue("ナレーション", "返却口にコインが吸い寄せられていく。焦りで手の震えも大きくなる。");
    } else {
      playSfx("return");
      setDialogue("パパ", "あれ、列がものすごく伸びてない？ ママまだ？");
    }
  }

  function jamKeyhole(point) {
    game.locker.miss += 1;
    game.anger = clamp(game.anger + 7, 0, 100);
    game.panic = clamp(game.panic + 12, 0, 100);
    advanceWait(8);
    addCoinParticle(point.x, point.y, "#ef476f", true);
    playSfx("miss");
    setDialogue("ママ", "そこ鍵穴！ コイン入れるところじゃない！ 落ち着いて、私。");
  }

  function checkLockerDoor(point) {
    game.locker.lockersChecked += 1;
    game.anger = clamp(game.anger + 5, 0, 100);
    game.panic = clamp(game.panic + 7, 0, 100);
    advanceWait(10);
    addCoinParticle(point.x, point.y, "#8ecae6", true);
    playSfx("move");

    if (game.locker.wrong >= 2) {
      setDialogue("ママ", "空いてるロッカーを探してたら、上に投入口って書いてある……えっ。");
    } else {
      setDialogue("ママ", "このロッカーなら動く？ あっちもこっちも空いてるけど、時間がない。");
    }
  }

  function dropCoin(point) {
    game.locker.miss += 1;
    game.anger = clamp(game.anger + 4, 0, 100);
    game.panic = clamp(game.panic + 9, 0, 100);
    advanceWait(5);
    addCoinParticle(point.x, point.y, "#f7c948", true);
    playSfx("miss");
    setDialogue("ママ", "手が震えてコインが落ちた。拾って、もう一回。");
  }

  function finishStory() {
    game.waitRevealed = true;
    const trueReplay = game.locker.wrong >= 4 && game.wait >= 190;
    const legend = game.locker.wrong >= 5 && game.wait >= 200 && game.panic >= 70;
    const good = game.locker.wrong === 0 && game.locker.miss <= 1 && game.wait <= game.waitStart + 18;
    const broken = game.locker.lockersChecked >= 3 || (game.locker.wrong >= 2 && game.locker.lockersChecked >= 1);
    game.laugh = clamp(
      game.locker.wrong * 17 +
        game.locker.lockersChecked * 8 +
        game.locker.miss * 4 +
        (game.wait >= 190 ? 24 : 0) +
        (game.panic >= 75 ? 12 : 0),
      0,
      100
    );

    if (legend) {
      game.finalTitle = "家族伝説エンド";
      game.finalText = "待ち時間も怒りも焦りも最大級。でも返却口連投の真相で、怒りは全部笑いに変わった。";
      setDialogue("パパ", "返却口に何枚入れたの！？ もうそれは伝説だよ。");
    } else if (trueReplay) {
      game.finalTitle = "実話再現エンド";
      game.finalText = "前の方に並べたはずの列は大混雑へ。パパは激おこだったが、返却口に連投していた話で大爆笑した。";
      setDialogue("パパ", "返却口にずっと入れてたの！？ それは怒れない、面白すぎる。");
    } else if (good) {
      game.finalTitle = "神対応ママエンド";
      game.finalText = "焦りを抑えて投入口へ一直線。列も家族の空気も守られた。事件は起きなかったが朝イチは勝った。";
      setDialogue("子ども", "ママ早い！ 今日はめちゃくちゃ順調だね。");
    } else if (broken) {
      game.finalTitle = "壊れてる疑惑エンド";
      game.finalText = "返却口に入れたり、別のロッカーを探したり。パパは怒りながらも、理由を聞いてじわじわ笑った。";
      setDialogue("ママ", "壊れてると思ったの。だって何回入れても反応しないから。");
    } else if (game.anger >= 95 && game.laugh < 65) {
      game.finalTitle = "パパ限界エンド";
      game.finalText = "理由を聞いても笑いに変わるまで少し時間がかかった。列の伸び方が強烈すぎた。";
      setDialogue("パパ", "面白いけど、まず並ぼう。話はあとで聞く。");
    } else {
      game.finalTitle = "ロッカー小事件エンド";
      game.finalText = "少し遅れたが、家族旅行のネタとしては十分。帰り道で何度も話題になるタイプの事件。";
      setDialogue("子ども", "これ、帰ってからも絶対言われるやつだ。");
    }

    game.achievements = buildAchievements(trueReplay, legend, good);
  }

  function buildAchievements(trueReplay, legend, good) {
    const list = [];
    if (game.locker.wrong >= 5) list.push("返却口5連投");
    if (game.locker.wrong >= 2 || game.locker.lockersChecked >= 2) list.push("壊れてると思った人");
    if (game.wait >= 200) list.push("200分の奇跡");
    if (good) list.push("朝イチの勝者");
    if (game.laugh >= 70) list.push("パパ大爆笑");
    if (game.locker.successUnderPanic) list.push("震える手で成功");
    if (trueReplay) list.push("実話再現");
    if (legend) list.push("家族伝説");
    if (list.length === 0) list.push("平和な朝");
    return list;
  }

  function addCoinParticle(x, y, color, bounce) {
    for (let i = 0; i < (bounce ? 8 : 5); i += 1) {
      game.particles.push({
        x,
        y,
        vx: randomBetween(-92, 92),
        vy: bounce ? randomBetween(-210, -80) : randomBetween(-80, 20),
        life: randomBetween(0.65, 1.2),
        maxLife: 1.2,
        color,
        bounce
      });
    }
  }

  function spawnRoadObject() {
    const lane = Math.floor(Math.random() * laneXs.length);
    const type = Math.random() < 0.7 ? "cone" : "coffee";
    game.objects.push({ type, lane, y: -50, hit: false });
  }

  function updateDrive(dt) {
    game.driveProgress += dt * 6.6;
    game.sleep = clamp(game.sleep - dt * 0.9, 0, 100);
    game.focusCooldown = Math.max(0, game.focusCooldown - dt);
    game.spawnTimer -= dt;

    if (game.spawnTimer <= 0) {
      spawnRoadObject();
      game.spawnTimer = randomBetween(0.48, 0.9);
    }

    for (const object of game.objects) {
      object.y += dt * 255;
      if (!object.hit && object.lane === game.lane && Math.abs(object.y - 500) < 38) {
        object.hit = true;
        if (object.type === "cone") {
          game.sleep = clamp(game.sleep - 16, 0, 100);
          game.anger = clamp(game.anger + 5, 0, 100);
          advanceWait(4);
          setDialogue("パパ", "うわ、工事区間！ でも大阪まではまだ行ける。");
        } else {
          game.sleep = clamp(game.sleep + 15, 0, 100);
          setDialogue("ママ", "コーヒー補給。夜通しドライブ、まだ持つね。");
        }
      }
    }

    game.objects = game.objects.filter((object) => object.y < H + 70);

    if (game.sleep <= 0) {
      game.sleep = 22;
      advanceWait(14);
      game.anger = clamp(game.anger + 10, 0, 100);
      setDialogue("ナレーション", "眠気が限界。サービスエリアで深呼吸して、もう一度出発。");
    }

    if (game.driveProgress >= 100) {
      setScene("nap");
    }
  }

  function updateNap(dt) {
    if (!game.pending) game.napPhase = (game.napPhase + dt * 0.72) % 1;
  }

  function updateQueue(dt) {
    if (!game.pending) game.queuePhase = (game.queuePhase + dt * 0.58) % 1;
  }

  function updateLocker(dt) {
    game.locker.elapsed += dt;
    const pressure = Math.max(0, game.wait - game.waitStart);
    game.panic = clamp(game.panic + dt * (0.85 + pressure / 90 + game.locker.wrong * 0.12), 0, 100);

    if (game.locker.elapsed >= game.locker.nextWaitTick && game.locker.deposited < 5) {
      game.locker.nextWaitTick += 4.7;
      advanceWait(game.locker.wrong >= 2 ? 12 : 6);
      game.anger = clamp(game.anger + 5, 0, 100);

      if (game.wait >= 200 && !game.locker.hit200) {
        game.locker.hit200 = true;
        setDialogue("パパ", "表示がすごいことになってる。さっきまで朝イチ感あったのに。");
      }
    }

    if (game.locker.elapsed >= game.locker.nextDadPrompt && game.locker.deposited < 5) {
      game.locker.nextDadPrompt += randomBetween(6.2, 8.5);
      game.anger = clamp(game.anger + 7, 0, 100);
      game.panic = clamp(game.panic + 9, 0, 100);
      const lines = [
        "ママまだ？ こっち列が動いてるよ。",
        "今ならまだ前の方だけど、だんだん怪しくなってきた。",
        "子どもたちがそわそわしてる。合流できそう？",
        "待ち時間の気配が変わった。これはまずいかも。"
      ];
      setDialogue("パパ", lines[Math.min(lines.length - 1, Math.floor(game.anger / 28))]);
    }
  }

  function updateParticles(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 420 * dt;
      if (particle.bounce && particle.y > 386) {
        particle.y = 386;
        particle.vy *= -0.42;
        particle.vx *= 0.74;
      }
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);
  }

  function update(dt) {
    game.sceneTime += dt;

    if (game.pending) {
      game.pending.delay -= dt;
      if (game.pending.delay <= 0) {
        setScene(game.pending.scene);
        return;
      }
    }

    if (game.scene === "drive") updateDrive(dt);
    if (game.scene === "nap") updateNap(dt);
    if (game.scene === "queue") updateQueue(dt);
    if (game.scene === "locker") updateLocker(dt);
    updateParticles(dt);
    updateControls();
    updateHud();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillRoundRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function strokeRoundRect(x, y, w, h, r, color, width = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    roundRect(x, y, w, h, r);
    ctx.stroke();
  }

  function drawCentered(text, x, y, size, color, weight = "700") {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "Yu Gothic UI", "Meiryo", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawLeft(text, x, y, size, color, weight = "700") {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "Yu Gothic UI", "Meiryo", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawWrappedText(text, x, y, maxWidth, lineHeight, size, color, weight = "700") {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "Yu Gothic UI", "Meiryo", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = [...text];
    const lines = [];
    let line = "";
    for (const char of chars) {
      const trial = line + char;
      if (ctx.measureText(trial).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
    const start = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((item, index) => ctx.fillText(item, x, start + index * lineHeight));
  }

  function drawProgressBar(x, y, w, h, value, fill, label) {
    fillRoundRect(x, y, w, h, h / 2, "rgba(255,255,255,0.13)");
    fillRoundRect(x, y, w * clamp(value, 0, 1), h, h / 2, fill);
    strokeRoundRect(x, y, w, h, h / 2, "rgba(255,255,255,0.24)", 2);
    if (label) drawCentered(label, x + w / 2, y + h / 2, 16, "#fff8dc", "800");
  }

  function drawBaseSky(top, bottom) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (let i = 0; i < 60; i += 1) {
      const x = (i * 139) % W;
      const y = 24 + ((i * 71) % 170);
      const r = 1 + ((i * 17) % 3) * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function drawPerson(x, y, color, mood = "smile", scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    roundRect(-15, -2, 30, 46, 8);
    ctx.fill();
    ctx.fillStyle = "#f6c7a9";
    ctx.beginPath();
    ctx.arc(0, -17, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#26303a";
    ctx.beginPath();
    ctx.arc(-5, -19, 2, 0, TAU);
    ctx.arc(5, -19, 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#26303a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (mood === "angry") {
      ctx.moveTo(-7, -10);
      ctx.lineTo(7, -10);
      ctx.moveTo(-9, -25);
      ctx.lineTo(-2, -22);
      ctx.moveTo(9, -25);
      ctx.lineTo(2, -22);
    } else if (mood === "laugh") {
      ctx.arc(0, -13, 8, 0.05 * Math.PI, 0.95 * Math.PI);
    } else {
      ctx.arc(0, -14, 7, 0.1 * Math.PI, 0.9 * Math.PI);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFamily(x, y, mood = "smile", scale = 1) {
    drawPerson(x, y, familyColors[0], mood, scale);
    drawPerson(x + 44 * scale, y + 8 * scale, familyColors[1], "smile", scale * 0.84);
    drawPerson(x + 80 * scale, y + 8 * scale, familyColors[2], "smile", scale * 0.84);
    drawPerson(x + 124 * scale, y, familyColors[3], "smile", scale);
  }

  function drawCar(x, y, color, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    fillRoundRect(-34, -48, 68, 96, 16, color);
    fillRoundRect(-24, -28, 48, 42, 10, "rgba(190,233,255,0.8)");
    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.moveTo(-26, -52);
    ctx.lineTo(-74, -92);
    ctx.lineTo(-12, -54);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, -52);
    ctx.lineTo(74, -92);
    ctx.lineTo(12, -54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#20252b";
    ctx.fillRect(-42, -30, 10, 24);
    ctx.fillRect(32, -30, 10, 24);
    ctx.fillRect(-42, 18, 10, 24);
    ctx.fillRect(32, 18, 10, 24);
    ctx.restore();
  }

  function drawCone(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#ef476f";
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(22, 24);
    ctx.lineTo(-22, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-13, -1, 26, 6);
    ctx.fillRect(-22, 22, 44, 8);
    ctx.restore();
  }

  function drawCoffee(x, y) {
    ctx.save();
    ctx.translate(x, y);
    fillRoundRect(-18, -21, 36, 42, 8, "#fff4d8");
    fillRoundRect(-13, -12, 26, 24, 5, "#8b5e34");
    ctx.strokeStyle = "#fff4d8";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(21, 0, 10, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle() {
    drawBaseSky("#141c2a", "#221917");
    drawStars();
    ctx.fillStyle = "#20252b";
    ctx.beginPath();
    ctx.moveTo(350, H);
    ctx.lineTo(440, 250);
    ctx.lineTo(520, 250);
    ctx.lineTo(610, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i += 1) {
      const yy = 318 + i * 48;
      ctx.beginPath();
      ctx.moveTo(480, yy);
      ctx.lineTo(480, yy + 28);
      ctx.stroke();
    }
    drawCar(480, 515, "#ef476f", 0.9);
    drawCentered("夜通しUSJ", W / 2, 98, 54, "#fff4d8", "900");
    drawCentered("ロッカー事件", W / 2, 156, 58, "#ffd166", "900");
    drawWrappedText("毎回変わる混雑気配。焦るほど手が震え、コインが投入口から外れていく。", W / 2, 226, 760, 31, 24, "#f8f4e9", "800");

    fillRoundRect(116, 298, 728, 96, 8, "rgba(17,22,28,0.82)");
    strokeRoundRect(116, 298, 728, 96, 8, "#25c2a0", 3);
    drawCentered(modes[game.mode].label, W / 2, 330, 31, "#d8fff4", "900");
    drawCentered(modes[game.mode].detail, W / 2, 368, 20, "#fff4d8", "800");
    drawFamily(388, 455, "smile", 1.0);
  }

  function drawDrive() {
    drawBaseSky("#111927", "#26231f");
    drawStars();
    ctx.fillStyle = "#11161c";
    ctx.beginPath();
    ctx.moveTo(245, H);
    ctx.lineTo(400, 160);
    ctx.lineTo(560, 160);
    ctx.lineTo(715, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(268, H);
    ctx.lineTo(410, 168);
    ctx.moveTo(692, H);
    ctx.lineTo(550, 168);
    ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const y = ((game.sceneTime * 170 + i * 64) % 760) - 80;
      const width = 16 + y * 0.04;
      ctx.fillStyle = "rgba(255,244,216,0.72)";
      ctx.fillRect(W / 2 - width / 2, y, width, 34);
    }
    for (const object of game.objects) {
      const x = laneXs[object.lane];
      if (object.type === "cone") drawCone(x, object.y);
      else drawCoffee(x, object.y);
    }
    drawCar(laneXs[game.lane], 505, "#ef476f", 0.9);
    drawProgressBar(78, 44, 300, 22, game.driveProgress / 100, "#25c2a0", "大阪まで");
    drawProgressBar(582, 44, 300, 22, game.sleep / 100, "#ffd166", "眠気");
    drawFamily(54, 496, "smile", 0.72);
    drawCentered("夜の高速", W / 2, 82, 28, "#fff4d8", "900");
  }

  function drawNap() {
    drawBaseSky("#17212c", "#2a2126");
    ctx.fillStyle = "#2f3640";
    ctx.fillRect(0, 402, W, 198);
    ctx.fillStyle = "rgba(255,209,102,0.15)";
    ctx.fillRect(720, 74, 96, 128);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    ctx.strokeRect(720, 74, 96, 128);
    for (let i = 0; i < 4; i += 1) {
      fillRoundRect(170 + i * 150, 404, 112, 64, 20, familyColors[i]);
      fillRoundRect(183 + i * 150, 434, 86, 52, 20, "rgba(255,255,255,0.16)");
    }
    fillRoundRect(320, 120, 320, 250, 8, "#f8f4e9");
    fillRoundRect(348, 148, 264, 194, 8, "#20252b");
    drawCentered("仮眠アラーム", 480, 172, 28, "#fff4d8", "900");
    const barX = 378;
    const barY = 272;
    const barW = 204;
    fillRoundRect(barX, barY, barW, 22, 11, "rgba(255,255,255,0.18)");
    fillRoundRect(barX + barW * 0.43, barY, barW * 0.14, 22, 11, "#25c2a0");
    const markerX = barX + barW * (game.napPhase % 1);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(markerX, barY + 11, 16, 0, TAU);
    ctx.fill();
    strokeRoundRect(barX, barY, barW, 22, 11, "rgba(255,255,255,0.32)", 2);
    drawCentered(game.napResult || "朝イチ", 480, 326, 26, "#ffd166", "900");
    drawFamily(392, 516, "smile", 0.86);
  }

  function drawQueue() {
    drawBaseSky("#3b5362", "#f1b45b");
    ctx.fillStyle = "#26303a";
    ctx.fillRect(0, 438, W, 162);
    fillRoundRect(180, 104, 600, 145, 8, "#fff4d8");
    fillRoundRect(218, 134, 524, 86, 8, "#25c2a0");
    drawCentered("大阪テーマパーク", 480, 176, 38, "#14201e", "900");
    drawCentered("OPEN", 480, 216, 22, "#14201e", "900");
    for (let i = 0; i < 18; i += 1) {
      drawPerson(118 + i * 42, 397 + (i % 2) * 18, i % 3 === 0 ? "#ffd166" : i % 3 === 1 ? "#8ecae6" : "#ef476f", "smile", 0.58);
    }
    fillRoundRect(240, 296, 480, 46, 8, "rgba(0,0,0,0.32)");
    fillRoundRect(240 + 480 * 0.43, 296, 480 * 0.14, 46, 8, "rgba(37,194,160,0.82)");
    const marker = 240 + 480 * (game.queuePhase % 1);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(marker, 319, 18, 0, TAU);
    ctx.fill();
    strokeRoundRect(240, 296, 480, 46, 8, "rgba(255,255,255,0.32)", 2);
    drawCentered("列の流れ", 480, 272, 24, "#fff4d8", "900");
    drawCentered(`${game.queueAttempts}/6`, 480, 370, 24, "#fff4d8", "900");
    drawFamily(396, 500, game.anger > 50 ? "angry" : "smile", 0.86);
  }

  function drawLockerBank() {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const x = 86 + col * 72;
        const y = 102 + row * 72;
        fillRoundRect(x, y, 60, 58, 6, row % 2 === 0 ? "#3b4854" : "#34404b");
        strokeRoundRect(x, y, 60, 58, 6, "rgba(255,255,255,0.16)", 1.5);
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(x + 42, y + 25, 9, 4);
      }
    }
    strokeRoundRect(114, 192, 244, 156, 8, "rgba(142,202,230,0.45)", 3);
    drawCentered("空きロッカー", 236, 374, 18, "#d8f2ff", "900");
  }

  function drawLockerMachine() {
    const boxes = lockerHitboxes();
    fillRoundRect(442, 80, 308, 390, 8, "#f8f4e9");
    fillRoundRect(474, 114, 244, 312, 8, "#26303a");
    drawCentered("COIN LOCKER", 596, 140, 25, "#fff4d8", "900");
    drawCentered(`狙い: ${aimNames[currentAim()]}`, 596, 176, 20, "#ffd166", "900");

    const hintAlpha = game.locker.wrong >= 2 || game.locker.elapsed > 13 ? 0.95 : 0.42;
    fillRoundRect(boxes.insert.x, boxes.insert.y, boxes.insert.w, boxes.insert.h, 6, "#11161c");
    strokeRoundRect(boxes.insert.x - 6, boxes.insert.y - 6, boxes.insert.w + 12, boxes.insert.h + 12, 8, `rgba(37,194,160,${hintAlpha})`, 4);
    drawCentered("投入口", boxes.insert.x + boxes.insert.w / 2, boxes.insert.y - 20, 18, "#d8fff4", "900");

    fillRoundRect(boxes.keyhole.x, boxes.keyhole.y, boxes.keyhole.w, boxes.keyhole.h, 8, "#11161c");
    strokeRoundRect(boxes.keyhole.x - 4, boxes.keyhole.y - 4, boxes.keyhole.w + 8, boxes.keyhole.h + 8, 8, "rgba(239,71,111,0.45)", 3);
    drawCentered("鍵穴", boxes.keyhole.x + boxes.keyhole.w / 2, boxes.keyhole.y + boxes.keyhole.h + 22, 16, "#ffc9d4", "900");

    const bait = game.locker.wrong === 0 ? 0.85 + Math.sin(game.sceneTime * 6) * 0.15 : 0.3;
    fillRoundRect(boxes.returnSlot.x, boxes.returnSlot.y, boxes.returnSlot.w, boxes.returnSlot.h, 8, "#11161c");
    strokeRoundRect(boxes.returnSlot.x - 5, boxes.returnSlot.y - 5, boxes.returnSlot.w + 10, boxes.returnSlot.h + 10, 8, `rgba(255,209,102,${bait})`, 3);
    drawCentered("返却口", boxes.returnSlot.x + boxes.returnSlot.w / 2, boxes.returnSlot.y + boxes.returnSlot.h + 24, 18, "#fff4d8", "900");

    fillRoundRect(506, 384, 180, 42, 8, "#577590");
    drawCentered(`投入 ${game.locker.deposited}/5`, 596, 405, 23, "#f8f4e9", "900");
  }

  function drawQueueSidePanel() {
    fillRoundRect(766, 84, 150, 390, 8, "rgba(17,22,28,0.84)");
    drawCentered("パパ側", 841, 116, 22, "#ffd166", "900");
    drawCentered("混雑気配", 841, 154, 17, "#b7c1c2", "800");
    drawWrappedText(crowdLabel(), 841, 188, 118, 28, 24, game.wait >= 190 ? "#ef476f" : "#fff4d8", "900");
    drawProgressBar(792, 238, 98, 16, game.anger / 100, "#ef476f", "");
    drawCentered("怒り", 841, 266, 16, "#ffc9d4", "900");
    drawProgressBar(792, 304, 98, 16, game.panic / 100, "#ffd166", "");
    drawCentered("焦り", 841, 332, 16, "#fff4d8", "900");
    const dadMood = game.anger >= 70 ? "angry" : "smile";
    drawPerson(806, 420, "#ef476f", dadMood, 0.95);
    drawPerson(850, 430, "#ffd166", "smile", 0.74);
    drawPerson(884, 430, "#25c2a0", "smile", 0.74);
  }

  function drawHandAndCoins() {
    const hand = handPoint();
    const tremor = tremorAmount();
    ctx.strokeStyle = "rgba(246,199,169,0.92)";
    ctx.lineWidth = 17;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(430, 565);
    ctx.quadraticCurveTo(470, 500, hand.x, hand.y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,209,102,0.24)";
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, tremor, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(hand.x - 5, hand.y - 2, 10, 4);

    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < game.locker.deposited ? "#25c2a0" : "#ffd166";
      ctx.beginPath();
      ctx.arc(474 + i * 30, 492, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(469 + i * 30, 489, 10, 4);
    }

    if (game.locker.lastCoin) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(game.locker.lastCoin.x, game.locker.lastCoin.y, 16, 0, TAU);
      ctx.stroke();
    }
  }

  function drawLocker() {
    drawBaseSky("#20252b", "#1c1717");
    ctx.fillStyle = "#2f3640";
    ctx.fillRect(0, 430, W, 170);
    drawLockerBank();
    drawLockerMachine();
    drawQueueSidePanel();
    drawHandAndCoins();

    for (const particle of game.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    fillRoundRect(70, 454, 274, 62, 8, "rgba(17,22,28,0.82)");
    drawCentered("正確な待ち時間は合流まで非表示", 207, 476, 17, "#fff4d8", "900");
    drawCentered(`返却口 ${game.locker.wrong} / 落下 ${game.locker.miss} / 別ロッカー ${game.locker.lockersChecked}`, 207, 501, 16, "#b7c1c2", "800");
  }

  function drawFinale() {
    drawBaseSky("#556f62", "#2c2426");
    ctx.fillStyle = "#26303a";
    ctx.fillRect(0, 420, W, 180);
    fillRoundRect(88, 70, 784, 156, 8, "#fff4d8");
    drawCentered(game.finalTitle, 480, 118, 43, "#20252b", "900");
    drawWrappedText(game.finalText, 480, 178, 694, 29, 22, "#20252b", "800");

    fillRoundRect(120, 270, 200, 96, 8, "#11161c");
    drawCentered("開始時", 220, 302, 20, "#ffd166", "900");
    drawCentered(`${game.waitStart}分`, 220, 338, 34, "#fff4d8", "900");

    fillRoundRect(380, 270, 200, 96, 8, "#11161c");
    drawCentered("合流時", 480, 302, 20, "#ffd166", "900");
    drawCentered(`${Math.round(game.wait)}分`, 480, 338, 34, game.wait >= 190 ? "#ef476f" : "#fff4d8", "900");

    fillRoundRect(640, 270, 200, 96, 8, "#11161c");
    drawCentered("返却口", 740, 302, 20, "#ffd166", "900");
    drawCentered(`${game.locker.wrong}枚`, 740, 338, 34, "#fff4d8", "900");

    const badges = game.achievements.slice(0, 5);
    for (let i = 0; i < badges.length; i += 1) {
      const x = 116 + (i % 3) * 244;
      const y = 404 + Math.floor(i / 3) * 48;
      fillRoundRect(x, y, 212, 34, 8, "rgba(255,209,102,0.18)");
      strokeRoundRect(x, y, 212, 34, 8, "rgba(255,209,102,0.65)", 2);
      drawCentered(badges[i], x + 106, y + 17, 17, "#fff4d8", "900");
    }

    drawFamily(372, 540, game.laugh >= 70 ? "laugh" : "smile", 1.0);
    drawCentered(game.laugh >= 70 ? "激おこ → 大爆笑" : "もう一回で伝説を再現", 480, 492, 32, "#ffd166", "900");
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (game.scene === "title") drawTitle();
    if (game.scene === "drive") drawDrive();
    if (game.scene === "nap") drawNap();
    if (game.scene === "queue") drawQueue();
    if (game.scene === "locker") drawLocker();
    if (game.scene === "finale") drawFinale();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H
    };
  }

  function pointInBox(point, box) {
    return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  }

  function setAimForBox(name) {
    const index = aimOrder.indexOf(name);
    if (index >= 0) game.locker.aimIndex = index;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(event);

    if (game.scene === "locker") {
      const boxes = lockerHitboxes();
      for (const name of aimOrder) {
        if (pointInBox(point, boxes[name])) {
          setAimForBox(name);
          attemptCoin();
          return;
        }
      }
      return;
    }

    if (game.scene === "title" || game.scene === "nap" || game.scene === "queue" || game.scene === "finale") {
      handleAction();
    }
  });

  musicButton.addEventListener("click", toggleMusic);
  helpButton.addEventListener("click", openHelp);
  closeHelpButton.addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (event) => {
    if (event.target === helpOverlay) closeHelp();
  });

  leftButton.addEventListener("click", () => {
    if (game.scene === "title") setMode("normal");
    if (game.scene === "finale") {
      game.mode = "normal";
      setScene("title");
    }
    if (game.scene === "drive") moveLane(-1);
    if (game.scene === "locker") breathe();
  });

  rightButton.addEventListener("click", () => {
    if (game.scene === "title") setMode("replay");
    if (game.scene === "finale") {
      game.mode = "replay";
      setScene("title");
    }
    if (game.scene === "drive") moveLane(1);
    if (game.scene === "locker") cycleAim();
  });

  actionButton.addEventListener("click", handleAction);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (event.key === "Escape" && !helpOverlay.hidden) {
      closeHelp();
      return;
    }
    if (event.key === "ArrowLeft" || key === "a") {
      if (game.scene === "drive") moveLane(-1);
      if (game.scene === "locker") breathe();
    }
    if (event.key === "ArrowRight" || key === "d") {
      if (game.scene === "drive") moveLane(1);
      if (game.scene === "locker") cycleAim();
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      handleAction();
    }
    if (game.scene === "locker") {
      if (event.key === "1") {
        setAimForBox("insert");
        attemptCoin();
      }
      if (event.key === "2") {
        setAimForBox("returnSlot");
        attemptCoin();
      }
      if (event.key === "3") {
        setAimForBox("keyhole");
        attemptCoin();
      }
      if (event.key === "4") {
        setAimForBox("lockerDoor");
        attemptCoin();
      }
    }
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  setScene("title");
  requestAnimationFrame(loop);
})();
