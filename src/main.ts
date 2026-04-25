import "./style.css";

interface Question {
  q: string;
  a: string;
  img?: string;
  mp3?: string;
}

interface Category {
  name: string;
  x2?: boolean;
  music?: boolean;
  questions: Question[];
}

interface Team {
  name: string;
  score: number;
}

interface QuizData {
  categories: Category[];
  teams: Team[];
  used: Record<string, boolean>;
}

interface ActiveQ {
  catIdx: number;
  qIdx: number;
  pts: number;
  isX2: boolean;
  isMusic: boolean;
}

const POINTS = [100, 200, 300, 400, 500];

const data: QuizData = {
  categories: [
    {
      name: "Science",
      questions: [
        { q: "What planet is known as the Red Planet?", a: "Mars" },
        { q: "What is the chemical symbol for water?", a: "H₂O" },
        { q: "How many bones are in the adult human body?", a: "206" },
        {
          q: "What force keeps planets in orbit around the sun?",
          a: "Gravity",
        },
        {
          q: "What is the speed of light in a vacuum (approx)?",
          a: "299,792,458 m/s (~3×10⁸ m/s)",
        },
      ],
    },
    {
      name: "History",
      questions: [
        { q: "In what year did World War II end?", a: "1945" },
        {
          q: "Who was the first President of the United States?",
          a: "George Washington",
        },
        { q: "Which empire built the Colosseum?", a: "The Roman Empire" },
        { q: "In what year did the Berlin Wall fall?", a: "1989" },
        {
          q: "Who was the longest-reigning British monarch?",
          a: "Queen Elizabeth II (70 years)",
        },
      ],
    },
    {
      name: "Geography",
      questions: [
        { q: "What is the capital of Australia?", a: "Canberra" },
        { q: "Which is the longest river in the world?", a: "The Nile" },
        { q: "What country has the most natural lakes?", a: "Canada" },
        {
          q: "What is the smallest country in the world by area?",
          a: "Vatican City",
        },
        { q: "On which continent is the Sahara Desert located?", a: "Africa" },
      ],
    },
    {
      name: "Pop Culture",
      questions: [
        {
          q: "Which movie features the line 'To infinity and beyond!'?",
          a: "Toy Story",
        },
        { q: "What band was Freddie Mercury the lead singer of?", a: "Queen" },
        {
          q: "Which TV show featured characters living at 'The Peach Pit'?",
          a: "Beverly Hills, 90210",
        },
        { q: "What year was the first iPhone released?", a: "2007" },
        { q: "Who wrote the Harry Potter book series?", a: "J.K. Rowling" },
      ],
    },
    {
      name: "Sports",
      questions: [
        {
          q: "How many players are on a standard soccer (football) team?",
          a: "11",
        },
        {
          q: "In what city are the 2028 Summer Olympics being held?",
          a: "Los Angeles",
        },
        {
          q: "Which country has won the most FIFA World Cups?",
          a: "Brazil (5 times)",
        },
        { q: "What sport uses a puck?", a: "Ice Hockey" },
        { q: "How long is a standard marathon in kilometers?", a: "42.195 km" },
      ],
    },
    {
      name: "Words & Language",
      questions: [
        {
          q: "What is a word that reads the same forwards and backwards?",
          a: "Palindrome (e.g. 'racecar')",
        },
        { q: "How many letters are in the English alphabet?", a: "26" },
        {
          q: "What is the most spoken language in the world by native speakers?",
          a: "Mandarin Chinese",
        },
        {
          q: "What does the word 'ubiquitous' mean?",
          a: "Present, appearing, or found everywhere",
        },
        {
          q: "Which punctuation mark looks like a period with a comma below it?",
          a: "Semicolon ( ; )",
        },
      ],
    },
    {
      name: "Music",
      music: true,
      questions: [
        { q: "Write your question here", a: "Write your answer here", mp3: "" },
        { q: "Write your question here", a: "Write your answer here", mp3: "" },
        { q: "Write your question here", a: "Write your answer here", mp3: "" },
        { q: "Write your question here", a: "Write your answer here", mp3: "" },
        { q: "Write your question here", a: "Write your answer here", mp3: "" },
      ],
    },
    {
      name: "X2",
      x2: true,
      questions: [
        { q: "Write your hard question here", a: "Write your answer here" },
        { q: "Write your hard question here", a: "Write your answer here" },
        { q: "Write your hard question here", a: "Write your answer here" },
        { q: "Write your hard question here", a: "Write your answer here" },
        { q: "Write your hard question here", a: "Write your answer here" },
      ],
    },
  ],
  teams: [
    { name: "Team 1", score: 0 },
    { name: "Team 2", score: 0 },
    { name: "Team 3", score: 0 },
  ],
  used: {},
};

let activeQ: ActiveQ | null = null;
let selectedTeamIdx = 0;
let imgStaging: Record<string, string> = {};
let mp3Staging: Record<string, string> = {};

function loadData() {}
function saveData() {}

function closeIfOutside(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    (e.currentTarget as HTMLElement).style.display = "none";
  }
}

function renderAll() {
  renderScoreboard();
  renderBoard();
}

function renderScoreboard() {
  const el = document.getElementById("scoreboard")!;
  el.textContent = "";
  data.teams.forEach((t, i) => {
    const card = document.createElement("div");
    card.className = "team-card" + (i === selectedTeamIdx ? " active" : "");
    card.onclick = () => {
      selectedTeamIdx = i;
      renderScoreboard();
    };

    const nameWrap = document.createElement("div");
    nameWrap.className = "team-name-wrap";
    const label = document.createElement("span");
    label.className = "team-label";
    label.textContent = "Player / Team";
    const nameInput = document.createElement("input");
    nameInput.className = "team-name";
    nameInput.value = t.name;
    nameInput.onclick = (ev) => ev.stopPropagation();
    nameInput.onchange = () => {
      data.teams[i].name = nameInput.value;
      saveData();
      renderScoreboard();
    };
    nameWrap.appendChild(label);
    nameWrap.appendChild(nameInput);

    const scoreDiv = document.createElement("div");
    scoreDiv.className = "team-score";
    scoreDiv.textContent = t.score.toLocaleString();

    const btnGroup = document.createElement("div");
    btnGroup.className = "team-btn-group";
    btnGroup.onclick = (ev) => ev.stopPropagation();
    const addBtn = document.createElement("button");
    addBtn.className = "score-btn add";
    addBtn.textContent = "+100";
    addBtn.onclick = () => adjustScore(i, 100);
    const subBtn = document.createElement("button");
    subBtn.className = "score-btn sub";
    subBtn.textContent = "-100";
    subBtn.onclick = () => adjustScore(i, -100);
    btnGroup.appendChild(addBtn);
    btnGroup.appendChild(subBtn);

    card.appendChild(nameWrap);
    card.appendChild(scoreDiv);
    card.appendChild(btnGroup);
    el.appendChild(card);
  });
  if (data.teams.length < 6) {
    const btn = document.createElement("button");
    btn.className = "add-team-btn";
    btn.textContent = "+ Add Team";
    btn.onclick = addTeam;
    el.appendChild(btn);
  }
}

function renderBoard() {
  const el = document.getElementById("board")!;
  el.style.gridTemplateColumns = `repeat(${data.categories.length}, 1fr)`;
  el.textContent = "";

  data.categories.forEach((cat, ci) => {
    const header = document.createElement("div");
    const isX2 = !!cat.x2;
    const isMusic = !!cat.music;
    let headerClass = "cat-header";
    if (isX2) headerClass += " x2-header";
    if (isMusic) headerClass += " music-header";
    header.className = headerClass;

    const catName = document.createElement("div");
    catName.className = "cat-name";
    catName.title = "Click to rename";
    catName.textContent = cat.name;
    catName.onclick = () => editCategory(ci);
    header.appendChild(catName);

    if (isX2) {
      const badge = document.createElement("div");
      badge.className = "x2-badge";
      badge.textContent = "DOUBLE SCORE";
      header.appendChild(badge);
    } else if (isMusic) {
      const badge = document.createElement("div");
      badge.className = "music-badge";
      badge.textContent = "🎵 MUSIC";
      header.appendChild(badge);
    } else {
      const editIcon = document.createElement("span");
      editIcon.className = "cat-edit-icon";
      editIcon.textContent = "✎";
      editIcon.onclick = () => editCategory(ci);
      header.appendChild(editIcon);
    }

    el.appendChild(header);
  });

  POINTS.forEach((pts, pi) => {
    data.categories.forEach((cat, ci) => {
      const key = `${ci}-${pi}`;
      const used = !!data.used[key];
      const isX2 = !!cat.x2;
      const isMusic = !!cat.music;
      const tile = document.createElement("div");
      let tileClass = "tile";
      if (isX2) tileClass += " x2-tile";
      if (isMusic) tileClass += " music-tile";
      if (used) tileClass += " used";
      tile.className = tileClass;
      if (isX2) {
        const bomb = document.createElement("span");
        bomb.className = "bomb-icon";
        bomb.textContent = "💣";
        tile.appendChild(bomb);
      } else {
        const ptsSpan = document.createElement("span");
        ptsSpan.className = "tile-pts";
        ptsSpan.textContent = String(pts);
        tile.appendChild(ptsSpan);
      }
      if (!used) tile.onclick = () => openQuestion(ci, pi, pts);
      el.appendChild(tile);
    });
  });
}

function openQuestion(catIdx: number, qIdx: number, pts: number) {
  const cat = data.categories[catIdx];
  const isX2 = !!cat.x2;
  const isMusic = !!cat.music;
  activeQ = { catIdx, qIdx, pts, isX2, isMusic };
  const q = cat.questions[qIdx];

  const modal = document.getElementById("q-modal")!;
  let modalClass = "modal";
  if (isX2) modalClass += " x2-modal";
  if (isMusic) modalClass += " music-modal";
  modal.className = modalClass;

  const mPts = document.getElementById("m-pts")!;
  const mCat = document.getElementById("m-cat")!;
  if (isX2) {
    mPts.textContent = "💣 X2";
    mCat.textContent = "DOUBLE SCORE — " + cat.name.toUpperCase();
  } else if (isMusic) {
    mPts.textContent = "🎵 " + pts;
    mCat.textContent = "MUSIC — " + cat.name.toUpperCase();
  } else {
    mPts.textContent = String(pts);
    mCat.textContent = cat.name.toUpperCase();
  }

  document.getElementById("m-question")!.textContent = q.q;
  const mAnswer = document.getElementById("m-answer")!;
  mAnswer.textContent = "Answer: " + q.a;
  mAnswer.style.display = "none";

  const imgWrap = document.getElementById("m-image-wrap")!;
  const imgEl = document.getElementById("m-image") as HTMLImageElement;
  if (q.img) {
    imgEl.src = q.img;
    imgWrap.style.display = "flex";
  } else {
    imgEl.src = "";
    imgWrap.style.display = "none";
  }

  let ytWrap = document.getElementById("m-yt-play-wrap");
  if (!ytWrap) {
    ytWrap = document.createElement("div");
    ytWrap.id = "m-yt-play-wrap";
    ytWrap.className = "yt-play-wrap";
    imgWrap.after(ytWrap);
  }
  if (isMusic && q.mp3 && q.mp3.trim()) {
    ytWrap.textContent = "";
    const playBtn = document.createElement("button");
    playBtn.className = "yt-play-btn";
    playBtn.id = "mp3-play-btn";
    playBtn.onclick = toggleMp3;
    const playIcon = document.createElement("span");
    playIcon.id = "mp3-play-icon";
    playIcon.style.cssText =
      "font-size:18px;line-height:1;width:32px;height:32px;background:var(--purple-dark);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0";
    playIcon.textContent = "▶";
    const playLabel = document.createElement("span");
    playLabel.id = "mp3-play-label";
    playLabel.textContent = "Play";
    playBtn.appendChild(playIcon);
    playBtn.appendChild(playLabel);
    ytWrap.appendChild(playBtn);
    ytWrap.style.display = "flex";
    const audio = document.getElementById("music-audio") as HTMLAudioElement;
    audio.src = q.mp3;
    audio.load();
    audio.onended = () => resetMp3Btn();
  } else {
    ytWrap.textContent = "";
    ytWrap.style.display = "none";
    stopMp3();
  }

  let x2Label = document.getElementById("x2-info-label");
  if (!x2Label) {
    x2Label = document.createElement("div");
    x2Label.id = "x2-info-label";
    x2Label.className = "x2-label";
    document.getElementById("m-question")!.before(x2Label);
  }
  if (isX2) {
    x2Label.textContent =
      "Correct answer doubles this player's current score! (x2)";
    x2Label.style.display = "block";
  } else {
    x2Label.style.display = "none";
  }

  document.getElementById("btn-reveal")!.style.display = "inline-flex";
  document.getElementById("btn-correct")!.style.display = "none";
  document.getElementById("btn-wrong")!.style.display = "none";

  renderTeamSelector();
  document.getElementById("q-overlay")!.style.display = "flex";
}

function renderTeamSelector() {
  const el = document.getElementById("m-teams")!;
  el.textContent = "";
  const awardLabel = document.createElement("span");
  awardLabel.style.cssText =
    "font-size:12px;color:var(--text-muted);margin-right:8px;align-self:center";
  awardLabel.textContent = "Awarding:";
  el.appendChild(awardLabel);
  data.teams.forEach((t, i) => {
    const chip = document.createElement("div");
    chip.className = "ts-chip" + (i === selectedTeamIdx ? " selected" : "");
    chip.textContent = t.name;
    chip.onclick = () => {
      selectedTeamIdx = i;
      renderTeamSelector();
    };
    el.appendChild(chip);
  });
}

function revealAnswer() {
  document.getElementById("m-answer")!.style.display = "block";
  document.getElementById("btn-reveal")!.style.display = "none";
  document.getElementById("btn-correct")!.style.display = "inline-flex";
  document.getElementById("btn-wrong")!.style.display = "inline-flex";
}

function markResult(correct: boolean) {
  if (!activeQ) return;
  if (activeQ.isX2 && correct) {
    data.teams[selectedTeamIdx].score *= 2;
    saveData();
    renderScoreboard();
  } else if (!activeQ.isX2) {
    const delta = correct ? activeQ.pts : -activeQ.pts;
    adjustScore(selectedTeamIdx, delta);
  }
  markUsed();
  closeQModal();
}

function skipQuestion() {
  if (activeQ) {
    markUsed();
    closeQModal();
  }
}

function markUsed() {
  if (activeQ) {
    data.used[`${activeQ.catIdx}-${activeQ.qIdx}`] = true;
    saveData();
    renderBoard();
    activeQ = null;
  }
}

function closeQModal() {
  document.getElementById("q-overlay")!.style.display = "none";
  stopMp3();
  activeQ = null;
}

function toggleMp3() {
  const audio = document.getElementById("music-audio") as HTMLAudioElement;
  const btn = document.getElementById("mp3-play-btn");
  const label = document.getElementById("mp3-play-label");
  const icon = document.getElementById("mp3-play-icon");
  if (!audio || !audio.src || audio.src === window.location.href) return;

  if (audio.paused) {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (label) label.textContent = "Pause";
          if (icon) icon.textContent = "⏸";
          if (btn) btn.style.boxShadow = "0 0 20px var(--purple-glow)";
        })
        .catch((err) => {
          console.error("Audio play failed:", err);
        });
    }
  } else {
    audio.pause();
    if (label) label.textContent = "Play";
    if (icon) icon.textContent = "▶";
    if (btn) btn.style.boxShadow = "";
  }
}

function resetMp3Btn() {
  const btn = document.getElementById("mp3-play-btn");
  const label = document.getElementById("mp3-play-label");
  const icon = document.getElementById("mp3-play-icon");
  if (btn) btn.style.boxShadow = "";
  if (label) label.textContent = "Play";
  if (icon) icon.textContent = "▶";
}

function stopMp3() {
  const audio = document.getElementById("music-audio") as HTMLAudioElement;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.src = "";
  }
  resetMp3Btn();
}

function editCategory(ci: number) {
  const cat = data.categories[ci];
  const content = document.getElementById("edit-content")!;
  content.textContent = "";

  const title = document.createElement("div");
  title.style.cssText =
    "font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.08em;color:var(--gold);margin-bottom:18px";
  title.textContent = "Edit Category";
  content.appendChild(title);

  const nameLabel = document.createElement("div");
  nameLabel.className = "field-label";
  nameLabel.textContent = "Category Name";
  content.appendChild(nameLabel);

  const nameInput = document.createElement("input");
  nameInput.className = "edit-input";
  nameInput.id = "ec-name";
  nameInput.value = cat.name;
  content.appendChild(nameInput);

  const qTitle = document.createElement("div");
  qTitle.className = "field-label";
  qTitle.style.marginTop = "20px";
  qTitle.textContent = "Quick Edit Questions";
  content.appendChild(qTitle);

  POINTS.forEach((pts, pi) => {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "14px";

    const ptsLabel = document.createElement("div");
    ptsLabel.style.cssText =
      "font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em";
    ptsLabel.textContent = `${pts} pts`;
    wrap.appendChild(ptsLabel);

    const qLabel = document.createElement("div");
    qLabel.className = "field-label";
    qLabel.style.cssText = "margin-top:6px;font-size:10px";
    qLabel.textContent = "Question";
    wrap.appendChild(qLabel);

    const qInput = document.createElement("input");
    qInput.className = "edit-input";
    qInput.id = `ec-q-${pi}`;
    qInput.value = cat.questions[pi]?.q || "";
    wrap.appendChild(qInput);

    const aLabel = document.createElement("div");
    aLabel.className = "field-label";
    aLabel.style.fontSize = "10px";
    aLabel.textContent = "Answer";
    wrap.appendChild(aLabel);

    const aInput = document.createElement("input");
    aInput.className = "edit-input";
    aInput.id = `ec-a-${pi}`;
    aInput.value = cat.questions[pi]?.a || "";
    wrap.appendChild(aInput);

    content.appendChild(wrap);
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "edit-save";
  saveBtn.textContent = "Save Category";
  saveBtn.onclick = () => saveCategoryEdit(ci);
  content.appendChild(saveBtn);

  document.getElementById("edit-overlay")!.style.display = "flex";
}

function saveCategoryEdit(ci: number) {
  data.categories[ci].name =
    (document.getElementById("ec-name") as HTMLInputElement).value.trim() ||
    data.categories[ci].name;
  POINTS.forEach((_, pi) => {
    const q = (document.getElementById(`ec-q-${pi}`) as HTMLInputElement).value;
    const a = (document.getElementById(`ec-a-${pi}`) as HTMLInputElement).value;
    if (!data.categories[ci].questions[pi])
      data.categories[ci].questions[pi] = { q: "", a: "" };
    data.categories[ci].questions[pi].q = q;
    data.categories[ci].questions[pi].a = a;
  });
  saveData();
  renderAll();
  closeEditModal();
}

function closeEditModal() {
  document.getElementById("edit-overlay")!.style.display = "none";
}

function buildAdminQuestionAccordion(
  cat: Category,
  ci: number,
  pi: number,
  pts: number,
  isX2: boolean,
  isMusic: boolean,
) {
  const q = cat.questions[pi] || { q: "", a: "", img: "", mp3: "" };
  const hasImg = !!q.img;
  const hasMp3 = !!q.mp3;

  const accordion = document.createElement("div");
  accordion.className =
    "q-accordion" + (isX2 ? " x2-acc" : isMusic ? " music-acc" : "");

  // Header
  const accHeader = document.createElement("div");
  accHeader.className = "q-acc-header";
  accHeader.onclick = () => {
    accHeader.classList.toggle("collapsed");
    accBody.classList.toggle("hidden");
  };
  const headerLabel = document.createElement("span");
  let headerText =
    (isX2 ? "💣 " : isMusic ? "🎵 " : "") +
    pts +
    (isX2 ? " — Double Score" : " pts");
  if (hasImg) headerText += " 📷";
  if (hasMp3) headerText += " 🎵";
  headerLabel.textContent = headerText;
  const arrow = document.createElement("span");
  arrow.style.cssText = "font-size:11px;opacity:.6";
  arrow.textContent = "▼";
  accHeader.appendChild(headerLabel);
  accHeader.appendChild(arrow);

  // Body
  const accBody = document.createElement("div");
  accBody.className = "q-acc-body";
  const fieldRow = document.createElement("div");
  fieldRow.className = "q-field-row";

  const labelColor = isX2
    ? "rgba(255,122,0,0.8)"
    : isMusic
      ? "rgba(168,85,247,0.9)"
      : "var(--text-muted)";

  // Question label + textarea
  const qLabel = document.createElement("label");
  qLabel.style.cssText = `font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:.08em`;
  qLabel.textContent = "Question";
  fieldRow.appendChild(qLabel);

  const qTextarea = document.createElement("textarea");
  qTextarea.className = "mini-textarea";
  qTextarea.id = `adm-q-${ci}-${pi}`;
  qTextarea.textContent = q.q;
  fieldRow.appendChild(qTextarea);

  // Answer label + input
  const aLabel = document.createElement("label");
  aLabel.style.cssText = `font-size:10px;color:${labelColor};text-transform:uppercase;letter-spacing:.08em`;
  aLabel.textContent = "Answer";
  fieldRow.appendChild(aLabel);

  const aInput = document.createElement("input");
  aInput.className = "mini-input";
  aInput.id = `adm-a-${ci}-${pi}`;
  aInput.value = q.a;
  fieldRow.appendChild(aInput);

  // Image upload zone
  const imgZone = document.createElement("div");
  imgZone.className = "img-upload-zone" + (isX2 ? " x2-zone" : "");

  const imgLabel = document.createElement("span");
  imgLabel.className = "img-upload-label" + (isX2 ? " x2-label-text" : "");
  imgLabel.textContent = "Image (optional) — shown during the question";
  imgZone.appendChild(imgLabel);

  const imgPreview = document.createElement("img");
  imgPreview.className = "img-preview-thumb";
  imgPreview.id = `adm-img-preview-${ci}-${pi}`;
  if (hasImg) {
    imgPreview.src = q.img!;
  } else {
    imgPreview.style.display = "none";
  }
  imgZone.appendChild(imgPreview);

  const imgBtnRow = document.createElement("div");
  imgBtnRow.style.cssText =
    "display:flex;gap:8px;align-items:center;flex-wrap:wrap";

  const chooseImgBtn = document.createElement("button");
  chooseImgBtn.className = "img-file-btn" + (isX2 ? " x2-btn" : "");
  chooseImgBtn.type = "button";
  chooseImgBtn.textContent = "📷 Choose Image";
  chooseImgBtn.onclick = () => imgFileInput.click();
  imgBtnRow.appendChild(chooseImgBtn);

  const clearImgBtn = document.createElement("button");
  clearImgBtn.className = "img-clear-btn";
  clearImgBtn.id = `adm-img-clear-${ci}-${pi}`;
  clearImgBtn.type = "button";
  if (!hasImg) clearImgBtn.style.display = "none";
  clearImgBtn.textContent = "✗ Remove";
  clearImgBtn.onclick = () => {
    imgStaging[`${ci}-${pi}`] = "";
    imgPreview.src = "";
    imgPreview.style.display = "none";
    clearImgBtn.style.display = "none";
  };
  imgBtnRow.appendChild(clearImgBtn);
  imgZone.appendChild(imgBtnRow);

  const imgFileInput = document.createElement("input");
  imgFileInput.type = "file";
  imgFileInput.accept = "image/*";
  imgFileInput.id = `adm-img-file-${ci}-${pi}`;
  imgFileInput.style.display = "none";
  imgFileInput.onchange = () => {
    const file = imgFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target as FileReader).result as string;
      imgStaging[`${ci}-${pi}`] = base64;
      imgPreview.src = base64;
      imgPreview.style.display = "block";
      clearImgBtn.style.display = "inline-block";
    };
    reader.readAsDataURL(file);
  };
  imgZone.appendChild(imgFileInput);
  fieldRow.appendChild(imgZone);

  // MP3 upload zone (music categories only)
  if (isMusic) {
    const mp3Zone = document.createElement("div");
    mp3Zone.className = "yt-input-zone";

    const mp3Label = document.createElement("span");
    mp3Label.className = "yt-input-label";
    mp3Label.textContent =
      "🎵 Audio File (MP3) — players click Play to hear it";
    mp3Zone.appendChild(mp3Label);

    const mp3BtnRow = document.createElement("div");
    mp3BtnRow.style.cssText =
      "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px";

    const chooseMp3Btn = document.createElement("button");
    chooseMp3Btn.className = "img-file-btn";
    chooseMp3Btn.type = "button";
    chooseMp3Btn.textContent = "🎵 Choose MP3";
    chooseMp3Btn.onclick = () => mp3FileInput.click();
    mp3BtnRow.appendChild(chooseMp3Btn);

    const clearMp3Btn = document.createElement("button");
    clearMp3Btn.className = "img-clear-btn";
    clearMp3Btn.id = `adm-mp3-clear-${ci}-${pi}`;
    clearMp3Btn.type = "button";
    if (!hasMp3) clearMp3Btn.style.display = "none";
    clearMp3Btn.textContent = "✗ Remove";
    clearMp3Btn.onclick = () => {
      mp3Staging[`${ci}-${pi}`] = "";
      mp3Status.textContent = "No audio file yet";
      clearMp3Btn.style.display = "none";
    };
    mp3BtnRow.appendChild(clearMp3Btn);
    mp3Zone.appendChild(mp3BtnRow);

    const mp3Status = document.createElement("div");
    mp3Status.className = "yt-link-preview";
    mp3Status.id = `adm-mp3-status-${ci}-${pi}`;
    mp3Status.textContent = hasMp3 ? "✓ Audio loaded" : "No audio file yet";
    mp3Zone.appendChild(mp3Status);

    const mp3FileInput = document.createElement("input");
    mp3FileInput.type = "file";
    mp3FileInput.accept = "audio/mp3,audio/mpeg,audio/*";
    mp3FileInput.id = `adm-mp3-file-${ci}-${pi}`;
    mp3FileInput.style.display = "none";
    mp3FileInput.onchange = () => {
      const file = mp3FileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        mp3Staging[`${ci}-${pi}`] = (e.target as FileReader).result as string;
        mp3Status.textContent = "✓ " + file.name + " loaded";
        clearMp3Btn.style.display = "inline-block";
      };
      reader.readAsDataURL(file);
    };
    mp3Zone.appendChild(mp3FileInput);
    fieldRow.appendChild(mp3Zone);
  }

  accBody.appendChild(fieldRow);
  accordion.appendChild(accHeader);
  accordion.appendChild(accBody);
  return accordion;
}

function openAdmin() {
  const content = document.getElementById("admin-content")!;
  content.textContent = "";

  const heading = document.createElement("div");
  heading.style.cssText =
    "font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.08em;color:var(--gold);margin-bottom:4px";
  heading.textContent = "All Questions Editor";
  content.appendChild(heading);

  const desc = document.createElement("p");
  desc.style.cssText =
    "font-size:12px;color:var(--text-muted);margin-bottom:18px";
  desc.textContent =
    "Edit category names, questions, answers, and add optional images to any tile. Music tiles also support audio files.";
  content.appendChild(desc);

  data.categories.forEach((cat, ci) => {
    const isX2 = !!cat.x2;
    const isMusic = !!cat.music;

    const sectionTitle = document.createElement("div");
    sectionTitle.className =
      "admin-section-title" +
      (isX2 ? " x2-title" : isMusic ? " music-title" : "");
    const prefix = isX2 ? "💣 " : isMusic ? "🎵 " : "";
    const suffix = isX2 ? " — X2 Double Score" : isMusic ? " — Music" : "";
    sectionTitle.textContent = `${prefix}${cat.name} — Category ${ci + 1}${suffix}`;
    content.appendChild(sectionTitle);

    const catRow = document.createElement("div");
    catRow.className = "admin-cat-row";

    const catLabel = document.createElement("label");
    catLabel.style.cssText = `font-size:11px;color:${isX2 ? "rgba(255,122,0,0.8)" : isMusic ? "rgba(168,85,247,0.9)" : "var(--text-muted)"};white-space:nowrap`;
    catLabel.textContent = "Category Name";
    catRow.appendChild(catLabel);

    const catInput = document.createElement("input");
    catInput.className = "admin-cat-input" + (isX2 ? " x2-cat-input" : "");
    catInput.id = `adm-cat-${ci}`;
    catInput.value = cat.name;
    catRow.appendChild(catInput);
    content.appendChild(catRow);

    POINTS.forEach((pts, pi) => {
      content.appendChild(
        buildAdminQuestionAccordion(cat, ci, pi, pts, isX2, isMusic),
      );
    });
  });

  document.getElementById("admin-overlay")!.style.display = "flex";
}

function saveAdmin() {
  data.categories.forEach((cat, ci) => {
    cat.name =
      (
        document.getElementById(`adm-cat-${ci}`) as HTMLInputElement
      ).value.trim() || cat.name;
    POINTS.forEach((_, pi) => {
      const qEl = document.getElementById(
        `adm-q-${ci}-${pi}`,
      ) as HTMLTextAreaElement | null;
      const aEl = document.getElementById(
        `adm-a-${ci}-${pi}`,
      ) as HTMLInputElement | null;
      if (qEl && aEl) {
        if (!cat.questions[pi]) cat.questions[pi] = { q: "", a: "" };
        cat.questions[pi].q = qEl.value;
        cat.questions[pi].a = aEl.value;
        const key = `${ci}-${pi}`;
        if (key in imgStaging) {
          cat.questions[pi].img = imgStaging[key];
        }
        if (cat.music && key in mp3Staging) {
          cat.questions[pi].mp3 = mp3Staging[key];
        }
      }
    });
  });
  imgStaging = {};
  mp3Staging = {};
  saveData();
  renderAll();
  closeAdmin();
}

function closeAdmin() {
  document.getElementById("admin-overlay")!.style.display = "none";
}

function addTeam() {
  data.teams.push({ name: `Team ${data.teams.length + 1}`, score: 0 });
  saveData();
  renderScoreboard();
}

function adjustScore(i: number, delta: number) {
  data.teams[i].score += delta;
  saveData();
  renderScoreboard();
}

function showWinner() {
  const sorted = [...data.teams].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const tied = sorted.filter((t) => t.score === top.score);

  const winnerContent = document.getElementById("winner-content")!;
  winnerContent.textContent = "";

  if (tied.length > 1) {
    const tieName = document.createElement("div");
    tieName.className = "winner-name";
    tieName.style.fontSize = "2rem";
    tieName.textContent = "TIE!";
    winnerContent.appendChild(tieName);

    const tieNames = document.createElement("div");
    tieNames.style.cssText = "font-size:1.1rem;color:var(--gold);margin:8px 0";
    tieNames.textContent = tied.map((t) => t.name).join(" & ");
    winnerContent.appendChild(tieNames);

    const tieScore = document.createElement("div");
    tieScore.className = "winner-score";
    tieScore.textContent = top.score.toLocaleString() + " points each";
    winnerContent.appendChild(tieScore);
  } else {
    const winName = document.createElement("div");
    winName.className = "winner-name";
    winName.textContent = top.name;
    winnerContent.appendChild(winName);

    const winScore = document.createElement("div");
    winScore.className = "winner-score";
    winScore.textContent = top.score.toLocaleString() + " points";
    winnerContent.appendChild(winScore);
  }

  const finalLabel = document.createElement("div");
  finalLabel.style.cssText =
    "margin-top:16px;font-size:13px;color:var(--text-muted)";
  finalLabel.textContent = "Final Scores";
  winnerContent.appendChild(finalLabel);

  const scoreList = document.createElement("div");
  scoreList.style.cssText =
    "margin-top:8px;display:flex;flex-direction:column;gap:6px;align-items:center";
  sorted.forEach((t, i) => {
    const row = document.createElement("div");
    row.style.cssText = `font-size:14px;color:${i === 0 ? "var(--gold)" : "var(--text-muted)"}`;
    row.textContent = `${i + 1}. ${t.name} — ${t.score.toLocaleString()}`;
    scoreList.appendChild(row);
  });
  winnerContent.appendChild(scoreList);

  document.getElementById("winner-overlay")!.style.display = "flex";
}

function resetBoard() {
  if (!confirm("Reset all used tiles? Scores and questions are kept.")) return;
  data.used = {};
  saveData();
  renderBoard();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ["q-overlay", "edit-overlay", "admin-overlay", "winner-overlay"].forEach(
      (id) => {
        document.getElementById(id)!.style.display = "none";
      },
    );
    stopMp3();
  }
});

// Expose functions to global scope for inline HTML event handlers
Object.assign(window, {
  openAdmin,
  closeAdmin,
  saveAdmin,
  showWinner,
  resetBoard,
  closeIfOutside,
  closeQModal,
  revealAnswer,
  markResult,
  skipQuestion,
  closeEditModal,
});

loadData();
renderAll();
