// =============================================
// あと少しで承認 - 稟議がいつまで経っても終わらない(けど実は終わる)ゲーム
// =============================================

// 画面の部品を取得
const game = document.querySelector(".game");
const gaugeFill = document.getElementById("gaugeFill");
const percentText = document.getElementById("percent");
const approverText = document.getElementById("approver");
const messageText = document.getElementById("message");
const pushButton = document.getElementById("pushButton");
const clickCountText = document.getElementById("clickCount");
const dialog = document.getElementById("dialog");
const dialogText = document.getElementById("dialogText");
const dialogButtons = document.getElementById("dialogButtons");

// =============================================
// 設定(遊びやすさの調整はここを触る)
// =============================================

// 承認に必要な「押した回数」の範囲。新しい稟議を出すたびに、この範囲からランダムに決まる
// 決まった回数ちょうどで必ず承認される(途中で再読み込みしても回数は変わらない)
// 動作を試すときは、両方を 200 にすると短く遊べる
const CLEAR_CLICKS_MIN = 700;
const CLEAR_CLICKS_MAX = 1200;

// 意地悪の発生確率(押した回数の進み具合ごとの段階)
// until: 押した回数が承認に必要な回数の何%未満までか / chance: 1回押すごとに意地悪が起きる確率
const EVENT_CHANCES = [
  { until: 20, chance: 0.03 },
  { until: 40, chance: 0.08 },
  { until: 60, chance: 0.1 },
  { until: 100, chance: 0.12 },
];

// 差し戻しの量(画面の進み具合を何%ぶん戻すか。[最小, 最大] の範囲でランダム)
// クリアまでの回数には影響せず、画面の%だけが下がる
const SETBACK = {
  coffee: [2, 4],        // 部長がコーヒーをこぼす
  fakeApproval: [2, 4],  // 偽の承認のあと
  error: [2, 4],         // 押印欄が足りないエラー
  fakeButton: [2, 2],    // 偽ボタンを押したとき
  reverse: [2, 2],       // 差し戻し期間中に押したとき
  dialogNo: [2, 2],      // 確認ダイアログで「いいえ」を押したとき
};

// 差し戻しの影響が薄まり始めるタイミング(押した回数が承認に必要な回数の何%から)
// ここからクリアに近づくほど差し戻しの影響が小さくなり、最後はゼロになる
const SETBACK_FADE_FROM = 70;

// 「偽の承認」が出始める進捗(画面に表示される%)
// 序盤で出ても驚きがないので、ある程度進んでから出す
const FAKE_APPROVAL_FROM = 70;

// 承認ルート。進み具合に合わせて、上の人に回っていく
const APPROVERS = [
  "係長",
  "課長",
  "次長",
  "部長",
  "本部長",
  "常務",
  "専務",
  "副社長",
  "社長",
  "会長",
  "創業者の銅像",
];

// ---------------------------------------------
// 「X でシェア」のポスト文
// ---------------------------------------------

// ポストの最後に付けるゲームのURL
const GAME_URL = "https://r4yt8dh528-gif.github.io/ato-sukoshi-de-shonin/";

// 定型文の上下をはさむ区切り線(「―」ダッシュ記号を10個)
// 罫線の「─」は文字数を2倍使うので使わない
const SHARE_DIVIDER = "――――――――――";

// 途中でシェアするときの定型文のパターン(承認される前用)。シェアするたびに、この中からランダムに1つ選ぶ
// 文中の {進捗} はそのときの進捗率(例: 99.9998%)、{承認者} は現在の承認者(例: 専務(確認中))に置き換わる
const SHARE_PATTERNS_IN_PROGRESS = [
  `【進捗報告】
件名:ボールペン1本の購入について
ステータス:承認待ち({進捗})
#あと少しで承認`,

  `件名:ボールペン1本の購入について
現在の承認者:{承認者}
まだ承認されていません。
#あと少しで承認`,

  `【催促中】
ボールペン1本の稟議、あと少しで承認されそうです。
進捗:{進捗}
#あと少しで承認`,
];

// 承認されたあと(エンディング)でシェアするときの定型文のパターン。シェアするたびに、この中からランダムに1つ選ぶ
// 1つのパターンは「` `」(バッククォート)で囲み、改行はそのまま書けば反映される
const SHARE_PATTERNS = [
  `【承認通知】
件名:ボールペン1本の購入について
決裁結果:承認
#あと少しで承認`,

  `件名:ボールペン1本の購入について
全承認者の決裁が完了しました。
#あと少しで承認`,

  `【決裁完了】
件名:ボールペン1本の購入について
最終承認者:創業者の銅像
#あと少しで承認`,

  `【速報】ボールペン1本の稟議、ついに承認されました。
最終承認者:創業者の銅像
なお、ボールペンは――
#あと少しで承認`,
];

// =============================================
// ゲームの状態
// =============================================
let clearClicks = randomClearClicks(); // 今回の稟議で承認に必要な回数(範囲からランダムに決まる)
let clickCount = 0;       // 押した回数。clearClicks に届いたら承認。差し戻されても減らない
let setbackDebt = 0;      // 差し戻しでたまった「遅れ」(0〜1)。画面の%を下げるためだけに使う
let mode = null;          // 進行中の意地悪モード。例: { type: "escape", left: 3 }
let busy = false;         // 演出中は押せないようにするためのフラグ
let cleared = false;      // 承認されたかどうか
let startTime = null;     // 最初に押した時刻
let fakeApproval = false; // 「偽の承認」を見せている最中かどうか
let eventBag = [];        // まだ出ていない意地悪の袋。全種類が1回ずつ出るまで同じものは出ない
const seenEvents = new Set(); // 一度でも出た意地悪の記録

// 承認に必要な回数を、設定の範囲からランダムに決める(最小・最大の回数も含む)
function randomClearClicks() {
  const range = CLEAR_CLICKS_MAX - CLEAR_CLICKS_MIN + 1;
  return CLEAR_CLICKS_MIN + Math.floor(Math.random() * range);
}

// 指定範囲のランダムな数を返す
function random(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 並び順をシャッフルした新しい配列を返す(どの並び順も同じ確率になる「フィッシャー・イェーツ」という方法)
function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------
// 進み具合の計算
// ---------------------------------------------

// 押した回数の進み具合(0〜1)
function clickRatio() {
  return clickCount / clearClicks;
}

// 画面に見せる進み具合(0〜1)
// 押した回数の進み具合から、差し戻しの「遅れ」を引いたもの
function progressRatio() {
  const ratio = clickRatio();
  const fadeStart = SETBACK_FADE_FROM / 100;

  // 差し戻しの効き目(1 = そのまま効く、0 = まったく効かない)
  let effect = 1;
  if (ratio > fadeStart) {
    effect = (1 - ratio) / (1 - fadeStart);
  }

  const progress = ratio - setbackDebt * effect;
  return Math.max(0, progress);
}

// ---------------------------------------------
// 表示用の進捗率
// 序盤は一気に進み、終盤ほどほとんど動かないように見せる
// ---------------------------------------------
function displayInfo() {
  if (cleared) return { text: "100", width: 100 };

  // 残り(%)。承認前は進み具合が必ず1未満なので、残りは必ず 0 より大きい
  const remaining = 100 * Math.pow(1 - progressRatio(), 4);

  // 100%に近づくほど小数点以下の桁を増やす
  let digits = 0;
  if (remaining < 10) digits = 1;
  if (remaining < 1) digits = 2;
  if (remaining < 0.1) digits = 4;
  if (remaining < 0.01) digits = 6;
  if (remaining < 0.0001) digits = 8;

  // 「残り」を整数に切り上げてから引き算するので、承認前に100%と表示されることはない
  const factor = Math.pow(10, digits);
  const remainUnits = Math.max(1, Math.ceil(remaining * factor));
  const shownUnits = 100 * factor - remainUnits;
  const s = String(shownUnits).padStart(digits + 1, "0");
  const text = digits === 0 ? s : s.slice(0, -digits) + "." + s.slice(-digits);
  return { text, width: 100 - remaining };
}

// 今、画面に表示している進捗(%)を数値で返す
function shownPercent() {
  return Number(displayInfo().text);
}

function currentApprover() {
  if (cleared) return "全員承認済み";
  const index = Math.min(APPROVERS.length - 1, Math.floor(progressRatio() * APPROVERS.length));
  return APPROVERS[index] + "(確認中)";
}

function render() {
  clickCountText.textContent = clickCount;

  // 偽の承認中は、本当の値で上書きせず「100%・ゲージ満タン」に見せ続ける
  if (fakeApproval) {
    percentText.textContent = "100%";
    gaugeFill.style.width = "100%";
    return;
  }

  const info = displayInfo();
  percentText.textContent = info.text + "%";
  gaugeFill.style.width = info.width + "%";
  approverText.textContent = currentApprover();
}

function say(text) {
  messageText.textContent = text;
}

// 画面を揺らす
function shake() {
  document.body.classList.remove("shake");
  void document.body.offsetWidth; // アニメーションを最初から再生させるおまじない
  document.body.classList.add("shake");
}

// 差し戻す(赤く光らせる)。range は SETBACK の [最小, 最大]
// 押した回数は減らさず、画面の%だけを下げる
function setback(range, text) {
  const amount = random(range[0], range[1]) / 100;
  setbackDebt = setbackDebt + amount;
  gaugeFill.classList.add("setback");
  setTimeout(() => gaugeFill.classList.remove("setback"), 600);
  shake();
  say(text);
  saveProgress();
}

// 押した回数を1増やす。clearClicks に届いたら承認して true を返す
function countClick() {
  if (startTime === null) startTime = Date.now();
  clickCount++;
  if (clickCount >= clearClicks) {
    cleared = true;
    busy = true;
    clearGame();
    return true;
  }
  saveProgress();
  return false;
}

// ---------------------------------------------
// 途中経過の保存(ブラウザの localStorage に保存する)
// ページを閉じたり再読み込みしても、同じブラウザなら続きから遊べる
// ---------------------------------------------
const SAVE_KEY = "ato-sukoshi-de-shonin-save";

function saveProgress() {
  const data = {
    clearClicks: clearClicks,
    clickCount: clickCount,
    setbackDebt: setbackDebt,
    startTime: startTime,
    // 意地悪はオブジェクトのままだと保存できないので、番号(何番目の意地悪か)に変えて保存する
    eventBag: eventBag.map((e) => events.indexOf(e)),
    seenEvents: [...seenEvents].map((e) => events.indexOf(e)),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // 保存できない環境(プライベートモードなど)でも、ゲームはそのまま続けられるようにする
  }
}

// 保存データがあれば読み込む。読み込めたら true を返す
function loadProgress() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch (e) {
    data = null;
  }
  if (!data || !(data.clickCount > 0)) return false;

  // 保存されている「承認に必要な回数」を使う(古い保存データにない場合は今回決めた回数のまま)
  const savedClearClicks = data.clearClicks || clearClicks;

  // おかしな保存データ(すでにクリア回数以上)なら使わない
  if (data.clickCount >= savedClearClicks) {
    clearSave();
    return false;
  }

  clearClicks = savedClearClicks;
  clickCount = data.clickCount;
  setbackDebt = data.setbackDebt || 0;
  startTime = data.startTime || Date.now();
  eventBag = (data.eventBag || []).map((i) => events[i]).filter(Boolean);
  (data.seenEvents || []).forEach((i) => {
    if (events[i]) seenEvents.add(events[i]);
  });
  return true;
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // 消せなくてもゲームには影響しない
  }
}

// ボタンを画面内のどこかへ移動させる(画面の端から16px以上内側)
function moveRandomly(button) {
  button.classList.add("escaping");
  const maxX = Math.max(16, window.innerWidth - button.offsetWidth - 16);
  const maxY = Math.max(16, window.innerHeight - button.offsetHeight - 16);
  button.style.left = random(16, maxX) + "px";
  button.style.top = random(16, maxY) + "px";
}

// 複数のボタンを、画面をマス目に区切って1マスに1つずつ置く(ボタン同士が重ならない)
// buttons の1つ目は本物のボタン。マス目が足りないときは、置けなかった偽ボタンを消す
function placeOnGrid(buttons) {
  const margin = 16;
  const gap = 8;

  // 一番大きいボタンの大きさを基準に、1マスの大きさを決める
  buttons.forEach((b) => b.classList.add("escaping"));
  const buttonWidth = Math.max(...buttons.map((b) => b.offsetWidth));
  const buttonHeight = Math.max(...buttons.map((b) => b.offsetHeight));
  const usableWidth = window.innerWidth - margin * 2;
  const usableHeight = window.innerHeight - margin * 2;
  const cols = Math.max(1, Math.floor(usableWidth / (buttonWidth + gap)));
  const rows = Math.max(1, Math.floor(usableHeight / (buttonHeight + gap)));
  const cellWidth = usableWidth / cols;
  const cellHeight = usableHeight / rows;

  // マス目の一覧を作って、順番をシャッフルする
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ col, row });
    }
  }
  const shuffledCells = shuffle(cells);

  buttons.forEach((button, i) => {
    const cell = shuffledCells[i];
    // マス目が足りない場合、本物以外は消す
    if (!cell) {
      button.remove();
      return;
    }
    // マスの中で少しだけ位置をずらして、整列しすぎないようにする
    const extraX = Math.max(0, cellWidth - button.offsetWidth - gap);
    const extraY = Math.max(0, cellHeight - button.offsetHeight - gap);
    button.style.left = margin + cell.col * cellWidth + random(0, extraX) + "px";
    button.style.top = margin + cell.row * cellHeight + random(0, extraY) + "px";
  });
}

// 画面の回転やウィンドウの大きさが変わったら、動いているボタンを画面内に置き直す
function relayoutButtons() {
  if (cleared) return;
  const fakes = [...document.querySelectorAll(".fake")];
  if (fakes.length > 0) {
    placeOnGrid([pushButton, ...fakes]);
    return;
  }
  if (pushButton.classList.contains("escaping")) {
    moveRandomly(pushButton);
  }
}

window.addEventListener("resize", relayoutButtons);

// ボタンや画面を元の状態に戻す
function resetLook() {
  pushButton.classList.remove("escaping", "ghost");
  pushButton.style.left = "";
  pushButton.style.top = "";
  pushButton.style.fontSize = "";
  pushButton.style.padding = "";
  pushButton.removeAttribute("tabindex");
  game.classList.remove("upside-down");
  document.querySelectorAll(".fake").forEach((b) => b.remove());
}

// ---------------------------------------------
// 意地悪イベント集
// 差し戻しは画面の%を下げるだけで、クリアまでの回数は変わらない
// ---------------------------------------------
const events = [
  {
    // ゲージが戻る
    run: () => setback(SETBACK.coffee, "部長が稟議書にコーヒーをこぼしました。書き直しです。"),
  },
  {
    // しばらくボタンが逃げ回る
    run: () => {
      mode = { type: "escape", left: 3 };
      say("課長が席を外しました。捕まえて催促してください。");
      moveRandomly(pushButton);
    },
  },
  {
    // しばらく押すと逆に減る
    run: () => {
      mode = { type: "reverse", left: 3 };
      say("差し戻し期間に入りました。催促するほど戻されます。");
    },
  },
  {
    // 承認されたと見せかける
    // canRun: このイベントを選んでよい条件(進捗が FAKE_APPROVAL_FROM % 以上のときだけ)
    canRun: () => shownPercent() >= FAKE_APPROVAL_FROM,
    run: () => {
      busy = true;
      fakeApproval = true;
      say("承認されました!おめでとうございます!");
      setTimeout(() => {
        fakeApproval = false;
        setback(SETBACK.fakeApproval, "...と思ったら、前のバージョンの書類でした。");
        render();
        busy = false;
      }, 1500);
    },
  },
  {
    // 謎のエラー
    run: () => setback(SETBACK.error, "エラー: 押印欄が足りません。様式を変更して再提出してください。"),
  },
  {
    // ボタンがいきなり小さくなり、押すたびにさらに縮む(5回目で元に戻る)
    run: () => {
      mode = { type: "shrink", left: 5 };
      shrinkButton();
      say("経費削減のため、催促ボタンを縮小します。");
    },
  },
  {
    // 偽物のボタンが大量発生
    run: () => {
      mode = { type: "fakes" };
      say("似たような稟議書が大量に回ってきました。あなたの書類はひとつだけです。");
      // 本物のボタンだけ文字が選択状態のまま残って、正解がばれないようにする
      window.getSelection().removeAllRanges();
      // 本物のボタンからフォーカス(キーボード操作の対象)を外す
      // (本物だけに枠線が出たり、Enter キーで必ず本物が押せたりしないようにするため)
      pushButton.blur();
      const fakes = [];
      for (let i = 0; i < 6; i++) {
        const fake = document.createElement("button");
        fake.className = "push-button fake";
        fake.textContent = pick(["催促する", "催促する", "催促する", "さいそくする", "催促する!"]);
        fake.addEventListener("click", () => {
          if (busy) return;
          // 偽ボタンを押した回数も「押した回数」に数える
          if (countClick()) return;
          fake.remove();
          setback(
            SETBACK.fakeButton,
            pick(["それは別部署の稟議書です。", "それは去年の稟議書です。", "それは経費精算の書類です。"])
          );
          render();
        });
        document.body.appendChild(fake);
        fakes.push(fake);
      }
      // 本物と偽物をまとめて、重ならないようにマス目に並べる
      placeOnGrid([pushButton, ...fakes]);
      // Tab キーで移動する順番もシャッフルする(本物がいつも最初に選ばれて、正解がばれないようにするため)
      const order = shuffle([pushButton, ...fakes]);
      order.forEach((button, i) => button.setAttribute("tabindex", i + 1));
    },
  },
  {
    // 画面が上下逆さまになる
    run: () => {
      mode = { type: "upsideDown", left: 4 };
      game.classList.add("upside-down");
      say("社長の意向により、書類は逆さまに読む運用になりました。");
    },
  },
  {
    // ボタンが透明になる
    run: () => {
      mode = { type: "ghost", left: 4 };
      pushButton.classList.add("ghost");
      say("ペーパーレス化を推進した結果、ボタンも見えなくなりました。");
    },
  },
  {
    // しつこい確認ダイアログ
    run: () => startConfirmHell(),
  },
];

// ---------------------------------------------
// しつこい確認ダイアログ
// 「はい」と「いいえ」の位置は毎回ランダムに入れ替わる
// ダイアログのボタンは「押した回数」に数えない
// ---------------------------------------------
const confirmQuestions = [
  "本当に催促しますか?",
  "上司の機嫌を損ねませんか?",
  "前回の催促から十分な時間が経っていますか?",
  "最終確認です。催促しますか?",
];

function startConfirmHell() {
  busy = true;
  showQuestion(0);
}

function showQuestion(index) {
  dialogText.textContent = confirmQuestions[index];
  dialogButtons.innerHTML = "";

  const yes = document.createElement("button");
  yes.textContent = "はい";
  yes.addEventListener("click", () => {
    if (index + 1 < confirmQuestions.length) {
      showQuestion(index + 1);
    } else {
      closeDialog();
      say("催促しました。書類が少しだけ前に進みました。");
      render();
    }
  });

  const no = document.createElement("button");
  no.textContent = "いいえ";
  no.addEventListener("click", () => {
    closeDialog();
    setback(SETBACK.dialogNo, "催促しないんですね。では書類を山の一番下に戻しておきます。");
    render();
  });

  // 位置を入れ替えて、うっかり「いいえ」を押させる
  const buttons = Math.random() < 0.5 ? [yes, no] : [no, yes];
  buttons.forEach((b) => dialogButtons.appendChild(b));
  dialog.classList.remove("hidden");
}

function closeDialog() {
  dialog.classList.add("hidden");
  busy = false;
}

// ---------------------------------------------
// 意地悪モード中に押されたときの処理
// ---------------------------------------------
function handleMode() {
  switch (mode.type) {
    case "escape":
      mode.left--;
      if (mode.left > 0) {
        moveRandomly(pushButton);
        say(pick(["会議室に逃げられました。", "喫煙所に移動したようです。", "給湯室で目撃情報があります。"]));
      } else {
        endMode("課長が席に戻ってきました。");
      }
      break;

    case "reverse":
      mode.left--;
      setback(SETBACK.reverse, "差し戻されました。差し戻し期間はあと " + mode.left + " 回です。");
      if (mode.left === 0) mode = null;
      break;

    case "shrink":
      mode.left--;
      if (mode.left > 0) {
        shrinkButton();
        say("まだ見えますか?さらに経費を削減しています。");
      } else {
        endMode("予算が下りたので、ボタンが元の大きさに戻りました。");
      }
      break;

    case "fakes":
      // 本物を押せたら終了
      endMode("正解です。さすが書類のプロ。");
      break;

    case "upsideDown":
    case "ghost":
      mode.left--;
      if (mode.left > 0) {
        say(mode.type === "ghost" ? "心の目で催促してください。" : "首、疲れませんか?");
      } else {
        endMode(mode.type === "ghost" ? "やっぱり紙に戻しました。" : "運用を元に戻しました。");
      }
      break;
  }
}

// ボタンの文字の大きさ(px)。残り回数が減るほど小さくなる
// 発生した瞬間に18px、そこから押すたびに 14 → 10 → 8 → 6px(豆粒サイズ)
const SHRINK_SIZES = [6, 8, 10, 14, 18];

function shrinkButton() {
  const size = SHRINK_SIZES[mode.left - 1];
  pushButton.style.fontSize = size + "px";
  // 余白も文字の大きさに合わせて小さくする
  const paddingY = Math.max(3, size * 0.65);
  const paddingX = Math.max(5, size * 1.3);
  pushButton.style.padding = paddingY + "px " + paddingX + "px";
}

function endMode(text) {
  mode = null;
  resetLook();
  say(text);
}

// 次に起こす意地悪を選ぶ(くじ引きの「引いたら戻さない」方式)
// 全種類が1回ずつ出るまで、同じ意地悪は出ない。全部出たら袋を詰め直す
function canRunNow(event) {
  // canRun がないイベントはいつでも選べる
  return !event.canRun || event.canRun();
}

function drawEvent() {
  if (eventBag.length === 0) {
    eventBag = [...events];
  }

  // 袋の中から、今の条件で起こせるものを選ぶ
  const candidates = eventBag.filter(canRunNow);

  // 袋に残っているのが「まだ条件を満たさない意地悪」だけなら、袋は減らさずに別の意地悪を出す
  if (candidates.length === 0) {
    return pick(events.filter(canRunNow));
  }

  const chosen = pick(candidates);
  eventBag.splice(eventBag.indexOf(chosen), 1);
  seenEvents.add(chosen);
  return chosen;
}

// 押した回数の進み具合から、意地悪の発生確率を決める(設定の EVENT_CHANCES を使う)
function eventChance() {
  // 救済措置: まだ見ていない意地悪が残っていて、残りの回数が少なくなったら必ず起こす
  // (意地悪1つにつき最大5回ほど押すので、余裕をみて1つあたり10回ぶんを確保する)
  const unseenCount = events.filter((e) => !seenEvents.has(e)).length;
  const clicksLeft = clearClicks - clickCount;
  if (unseenCount > 0 && clicksLeft <= unseenCount * 10) return 1;

  const percent = clickRatio() * 100;
  for (const step of EVENT_CHANCES) {
    if (percent < step.until) return step.chance;
  }
  return EVENT_CHANCES[EVENT_CHANCES.length - 1].chance;
}

// 普通に押したときのメッセージ。後半は「終わらない」と思わせる煽りにする
const earlyMessages = [
  "稟議書が回覧されています。",
  "順調に回っています。",
  "いい感じです。今期中には承認されそうです。",
  "上司が書類を手に取りました。",
];

const lateMessages = [
  "現在、承認者が会議中です。",
  "承認者が有給休暇を取得しました。",
  "ハンコの角度について協議しています。",
  "書類のフォントが規定と異なるため、確認中です。",
  "念のため、関係部署に回覧しています。",
  "承認者が「前向きに検討します」と言っています。",
  "「いい感じにしといて」とコメントが付きました。",
  "押印欄が足りなくなったので、紙を継ぎ足しました。",
  "承認フローに新しい役職が追加されました。",
  "「この件、誰の担当だっけ?」と言われています。",
  "ボールペン1本の購入に、ここまでかかるとは。",
  "この稟議に終わりはありません。たぶん。",
];

function normalMessage() {
  if (progressRatio() < 0.4) return pick(earlyMessages);
  return pick(lateMessages);
}

// ---------------------------------------------
// エンディング
// ---------------------------------------------
// かかった時間を「1日2時間3分04秒」のような文字にする(途中保存で日をまたぐこともあるため)
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = String(totalSec % 60).padStart(2, "0");
  let text = `${minutes}分${seconds}秒`;
  if (hours > 0 || days > 0) text = `${hours}時間` + text;
  if (days > 0) text = `${days}日` + text;
  return text;
}

function clearGame() {
  mode = null;
  resetLook();
  dialog.classList.add("hidden");
  render();

  // 承認されたら保存データは消す(次に開いたときは新しい稟議から)
  clearSave();

  document.getElementById("endClicks").textContent = clickCount + " 回";
  document.getElementById("endTime").textContent = formatTime(Date.now() - startTime);

  // 紙吹雪を作る
  const confetti = document.getElementById("confetti");
  const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
  for (let i = 0; i < 100; i++) {
    const piece = document.createElement("span");
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = pick(colors);
    piece.style.animationDuration = 3 + Math.random() * 4 + "s";
    piece.style.animationDelay = -Math.random() * 5 + "s";
    confetti.appendChild(piece);
  }

  // 100%の表示を1秒見せてからエンディングへ
  say("……あれ? 最後のハンコが押されたようです。");
  setTimeout(() => document.getElementById("ending").classList.remove("hidden"), 1000);
}

const ending = document.getElementById("ending");
const punchline = document.getElementById("punchline");
const retryButton = document.getElementById("retryButton");
const shareButton = document.getElementById("shareButton");
const shareNowButton = document.getElementById("shareNowButton");
const skipHint = document.getElementById("skipHint");

// ボタンが画面にちゃんと出ているか(出てくる前の透明なボタンを、うっかり押さないようにするため)
function isShown(element) {
  return getComputedStyle(element).opacity === "1";
}

retryButton.addEventListener("click", (e) => {
  // まだ透明なら押せない。タップは「全文表示」として扱う
  if (!isShown(retryButton)) return;
  e.stopPropagation();
  clearSave();
  location.reload();
});

// 結果を X(旧Twitter)でシェアする
shareButton.addEventListener("click", (e) => {
  if (!isShown(shareButton)) return;
  e.stopPropagation();
  window.open(buildShareUrl(SHARE_PATTERNS), "_blank", "noopener");
});

// 途中経過を X でシェアする(承認される前でも押せる)
shareNowButton.addEventListener("click", () => {
  window.open(buildShareUrl(SHARE_PATTERNS_IN_PROGRESS), "_blank", "noopener");
});

// ポスト文を組み立てて、X の投稿画面のURLにする
// patterns の中からランダムに1つ選び、{進捗} と {承認者} をそのときの状態に置き換える
// 形式: 空行2つ(本人が一言書くスペース) → 区切り線 → 定型文 → 区切り線 → ゲームのURL
function buildShareUrl(patterns) {
  const pattern = pick(patterns)
    .replaceAll("{進捗}", displayInfo().text + "%")
    .replaceAll("{承認者}", currentApprover());
  const lines = ["", "", SHARE_DIVIDER, pattern, SHARE_DIVIDER, GAME_URL];
  const text = lines.join("\n");
  return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
}

// 文章が1行出てくるたびに、その行が画面の真ん中に来るよう自動でスクロールする
ending.addEventListener("animationstart", (e) => {
  if (!e.target.classList.contains("line")) return;
  e.target.scrollIntoView({ behavior: "smooth", block: "center" });
});

// 最後のボタンまで出終わったら「タップで全文表示」の案内を消す
retryButton.addEventListener("animationend", () => {
  skipHint.classList.add("hidden");
});

// エンディング画面をタップしたら、残りの文章を一気に全部表示する(待ちきれない人向け)
ending.addEventListener("click", () => {
  if (ending.classList.contains("show-all")) return;
  ending.classList.add("show-all");
  punchline.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ---------------------------------------------
// ボタンが押されたときの処理
// ---------------------------------------------
pushButton.addEventListener("click", () => {
  // 演出中(偽の承認・確認ダイアログ・承認後)のクリックは数えない
  if (busy) return;

  // 回数を数える。ちょうど clearClicks 回目なら承認されて終わり
  if (countClick()) return;

  // 意地悪モード中
  if (mode) {
    handleMode();
    render();
    return;
  }

  // 意地悪イベントの抽選
  if (Math.random() < eventChance()) {
    drawEvent().run();
    render();
    return;
  }

  say(normalMessage());
  render();
});

// キーを押しっぱなしにしたときの連続入力を無視する
// (パソコンで Enter キーを長押しして、自動で連打するズルを防ぐため)
document.addEventListener(
  "keydown",
  (e) => {
    if (e.repeat) e.preventDefault();
  },
  true
);

// ---------------------------------------------
// 開始
// ---------------------------------------------
if (loadProgress()) {
  say("前回の稟議書の続きから再開します。まだ承認されていません。");
}
render();
