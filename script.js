const DEFAULT_HILL_NAME = "Happiness Hill";
const DEFAULT_POEM_NAME = "Happiness";
const HILL_OPTIONS = [DEFAULT_HILL_NAME, "The Mound", "Mirth Knoll", "Amberdown"];

const MENU_INTRO_PART_ONE =
  "Hold on. Is that a bit on the nose? Happiness. Huh.";

const MENU_INTRO_PART_TWO =
  "We won't be here long, but we could change it.";

const MENU_INTRO_PART_THREE = "It's up to you, but then set in stone.";

const MENU_KEEP_RESPONSE = "Yeah, we'll just roll with it, like a plop.";
const MENU_RENAME_RESPONSE =
  "Yeah, it's worth fixing this now. You only live once.";

const STAGE_WIDTH = 1100;
const STAGE_HEIGHT = 825;
const AUDIO_TARGET_VOLUME = 0.72;
const AUDIO_FADE_MS = 2800;
const AUDIO_END_FADE_MS = 3200;

const preludeShellEl = document.querySelector(".prelude-shell");
const titleCardEl = document.getElementById("title-card");
const poemCardEl = document.getElementById("poem-card");
const nightImageEl = document.getElementById("night-image");
const preludeAudioEl = document.getElementById("prelude-audio");
const startShellEl = document.getElementById("start-shell");
const startButtonEl = document.getElementById("start-button");
const dialogueShellEl = document.getElementById("dialogue-shell");
const dialoguePanelEl = document.querySelector(".dialogue-panel");
const dialogueTextEl = document.getElementById("dialogue-text");
const dialogueContinueEl = document.getElementById("dialogue-continue");
const dialogueOptionsEl = document.getElementById("dialogue-options");
const endCardEl = document.getElementById("end-card");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let activeRun = 0;
let choiceLocked = false;
let titleNameTarget = null;
let poemNameTarget = null;
let audioStarted = false;
let audioFadeFrame = 0;
let awaitingDialogueAdvance = false;
let dialogueAdvanceResolve = null;
let activeOptionIndex = 0;
let stageScaleFrame = 0;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function updateStageScale() {
  stageScaleFrame = 0;

  const shellStyles = window.getComputedStyle(preludeShellEl);
  const horizontalPadding =
    Number.parseFloat(shellStyles.paddingLeft) + Number.parseFloat(shellStyles.paddingRight);
  const verticalPadding =
    Number.parseFloat(shellStyles.paddingTop) + Number.parseFloat(shellStyles.paddingBottom);

  const availableWidth = Math.max(0, preludeShellEl.clientWidth - horizontalPadding);
  const availableHeight = Math.max(0, preludeShellEl.clientHeight - verticalPadding);

  let stageScale = Math.min(availableWidth / STAGE_WIDTH, availableHeight / STAGE_HEIGHT, 1);

  if (!Number.isFinite(stageScale) || stageScale <= 0) {
    stageScale = 1;
  }

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--stage-scale", stageScale.toFixed(5));
  rootStyle.setProperty("--stage-scaled-width", `${Math.round(STAGE_WIDTH * stageScale)}px`);
  rootStyle.setProperty("--stage-scaled-height", `${Math.round(STAGE_HEIGHT * stageScale)}px`);
}

function queueStageScale() {
  if (stageScaleFrame) {
    return;
  }

  stageScaleFrame = window.requestAnimationFrame(updateStageScale);
}

async function pauseFor(ms, runId) {
  await wait(reducedMotion ? 0 : ms);
  return activeRun === runId;
}

function characterDelay(character, baseDelay) {
  if (reducedMotion) {
    return 0;
  }

  if (character === "." || character === "!" || character === "?") {
    return baseDelay * 7;
  }

  if (character === "," || character === ";") {
    return baseDelay * 4;
  }

  if (character === " ") {
    return Math.max(12, Math.round(baseDelay * 0.45));
  }

  return baseDelay;
}

async function typeInto(element, text, runId, baseDelay) {
  element.textContent = "";

  if (reducedMotion) {
    element.textContent = text;
    return activeRun === runId;
  }

  const characterEls = [...text].map((character) => {
    const characterEl = document.createElement("span");
    characterEl.className = "type-char";
    characterEl.textContent = character;
    element.append(characterEl);
    return characterEl;
  });

  for (const characterEl of characterEls) {
    if (activeRun !== runId) {
      return false;
    }

    characterEl.classList.add("is-visible");
    await wait(characterDelay(characterEl.textContent, baseDelay));
  }

  return activeRun === runId;
}

function poemSelfNameFor(hillName) {
  return hillName === DEFAULT_HILL_NAME ? DEFAULT_POEM_NAME : hillName;
}

function showDialogueContinue() {
  dialogueContinueEl.classList.remove("hidden");
}

function hideDialogueContinue() {
  dialogueContinueEl.classList.add("hidden");
}

function clearDialogueReservation() {
  dialogueShellEl.style.width = "";
  dialoguePanelEl.style.minHeight = "";
  dialogueTextEl.style.minHeight = "";
}

function stopAudioFade() {
  if (audioFadeFrame) {
    window.cancelAnimationFrame(audioFadeFrame);
    audioFadeFrame = 0;
  }
}

function fadeAudioTo(targetVolume, durationMs) {
  stopAudioFade();

  if (reducedMotion || durationMs <= 0) {
    preludeAudioEl.volume = targetVolume;
    return;
  }

  const startVolume = preludeAudioEl.volume;
  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / durationMs);
    preludeAudioEl.volume = startVolume + (targetVolume - startVolume) * progress;

    if (progress < 1) {
      audioFadeFrame = window.requestAnimationFrame(step);
      return;
    }

    audioFadeFrame = 0;
  };

  audioFadeFrame = window.requestAnimationFrame(step);
}

async function startPreludeAudio() {
  if (audioStarted) {
    return true;
  }

  try {
    preludeAudioEl.currentTime = 0;
  } catch {
    // Some browsers can reject currentTime while not ready; playback can still proceed.
  }

  preludeAudioEl.volume = 0;

  try {
    await preludeAudioEl.play();
    audioStarted = true;
    fadeAudioTo(AUDIO_TARGET_VOLUME, AUDIO_FADE_MS);
    return true;
  } catch {
    return false;
  }
}

async function fadeOutPreludeAudio(runId) {
  if (!audioStarted) {
    return true;
  }

  fadeAudioTo(0, reducedMotion ? 0 : AUDIO_END_FADE_MS);

  if (!(await pauseFor((reducedMotion ? 0 : AUDIO_END_FADE_MS) + 120, runId))) {
    return false;
  }

  stopAudioFade();
  preludeAudioEl.pause();
  preludeAudioEl.volume = 0;
  audioStarted = false;

  try {
    preludeAudioEl.currentTime = 0;
  } catch {
    // Ignore reset issues; pausing is enough to avoid lingering background audio.
  }

  return activeRun === runId;
}

function showStartOverlay() {
  startShellEl.classList.remove("is-hidden");
  startShellEl.setAttribute("aria-hidden", "false");
  startButtonEl.disabled = false;

  if (typeof startButtonEl.focus === "function") {
    startButtonEl.focus({ preventScroll: true });
  }
}

function hideStartOverlay() {
  startShellEl.classList.add("is-hidden");
  startShellEl.setAttribute("aria-hidden", "true");
  startButtonEl.disabled = true;
}

function resetSceneState() {
  choiceLocked = false;
  titleNameTarget = null;
  poemNameTarget = null;
  awaitingDialogueAdvance = false;
  dialogueAdvanceResolve = null;
  activeOptionIndex = 0;

  titleCardEl.className = "title-card";
  titleCardEl.innerHTML = "";

  poemCardEl.className = "poem-card";
  poemCardEl.innerHTML = "";

  dialogueTextEl.textContent = "";
  dialogueOptionsEl.innerHTML = "";
  dialogueOptionsEl.classList.add("hidden");
  hideDialogueContinue();
  clearDialogueReservation();

  dialogueShellEl.classList.remove("is-active");
  dialogueShellEl.classList.remove("is-clearing");
  dialogueShellEl.classList.remove("is-measuring");
  dialogueShellEl.classList.remove("has-options");
  dialogueShellEl.setAttribute("aria-hidden", "true");

  endCardEl.classList.remove("is-visible");
  endCardEl.setAttribute("aria-hidden", "true");

  nightImageEl.classList.remove("is-visible");
  nightImageEl.style.setProperty("--night-fade-duration", reducedMotion ? "1200ms" : "26000ms");
  void nightImageEl.offsetWidth;
}

function renderTitleCard(hillName) {
  titleCardEl.innerHTML = "";

  const overlineEl = document.createElement("span");
  overlineEl.className = "title-overline gold-pixel";
  overlineEl.textContent = "Prelude";

  const mainEl = document.createElement("span");
  mainEl.className = "title-main gold-pixel";
  mainEl.textContent = hillName;
  titleNameTarget = mainEl;

  titleCardEl.append(overlineEl, mainEl);
}

function buildPoemLines(hillName) {
  const poemName = poemSelfNameFor(hillName);

  return [
    [{ text: "Abandon, I dwell, never alone." }],
    [{ text: "Born a hill, then a home," }],
    [{ text: "a bed, a grave. Though I am the same," }],
    [{ text: "for all these things I am given a name." }],
    [
      { text: "Abandon, I am " },
      { text: poemName, key: "poem-name" },
      { text: "," },
    ],
    [{ text: "named by the plops on a whim." }],
  ];
}

function createPoemSegment(text, key = null) {
  const span = document.createElement("span");
  span.className = "poem-word";
  span.textContent = text;

  if (key === "poem-name") {
    span.classList.add("poem-name");
    span.dataset.key = key;
    poemNameTarget = span;
  }

  return span;
}

function appendPoemSegment(lineEl, segment, state) {
  const tokens = segment.text.trim().split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    return;
  }

  tokens.forEach((token) => {
    if (/^[,.;:!?]+$/.test(token) && state.lastWord) {
      lineEl.append(document.createTextNode(token));
      return;
    }

    if (state.needsSpace) {
      lineEl.append(document.createTextNode(" "));
    }

    const wordEl = createPoemSegment(token, segment.key || null);
    lineEl.append(wordEl);
    state.lastWord = wordEl;
    state.needsSpace = true;
  });
}

function renderPoem(hillName) {
  poemNameTarget = null;
  poemCardEl.innerHTML = "";

  buildPoemLines(hillName).forEach((line) => {
    const lineEl = document.createElement("p");
    lineEl.className = "poem-line";
    const state = { needsSpace: false, lastWord: null };

    line.forEach((segment) => {
      appendPoemSegment(lineEl, segment, state);
    });

    poemCardEl.append(lineEl);
  });
}

async function revealPoem(runId) {
  renderPoem(DEFAULT_HILL_NAME);
  poemCardEl.classList.add("is-visible");

  const words = [...poemCardEl.querySelectorAll(".poem-word")];

  for (const word of words) {
    if (activeRun !== runId) {
      return false;
    }

    word.classList.add("is-visible");

    if (!(await pauseFor(280, runId))) {
      return false;
    }
  }

  return true;
}

function renderOptions(disabled = false) {
  dialogueOptionsEl.innerHTML = "";

  HILL_OPTIONS.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialogue-option";
    button.setAttribute("role", "option");
    button.dataset.name = option;
    button.dataset.index = String(index);
    button.textContent = option;
    button.disabled = disabled;

    button.addEventListener("mouseenter", () => {
      if (!choiceLocked) {
        setActiveOptionByIndex(index);
      }
    });

    button.addEventListener("click", () => {
      void handleChoice(option);
    });

    dialogueOptionsEl.append(button);
  });
}

function setOptionInteractivity(disabled) {
  const buttons = dialogueOptionsEl.querySelectorAll(".dialogue-option");
  buttons.forEach((button) => {
    button.disabled = disabled;
  });
}

function setActiveOptionByIndex(index) {
  const buttons = [...dialogueOptionsEl.querySelectorAll(".dialogue-option")];
  if (!buttons.length) {
    activeOptionIndex = 0;
    return;
  }

  const safeIndex = Math.max(0, Math.min(index, buttons.length - 1));
  activeOptionIndex = safeIndex;

  buttons.forEach((button, buttonIndex) => {
    button.classList.toggle("is-active-option", buttonIndex === safeIndex && !choiceLocked);
  });
}

function setSelectedOption(chosenHillName) {
  const buttons = dialogueOptionsEl.querySelectorAll(".dialogue-option");

  buttons.forEach((button) => {
    const isSelected = button.dataset.name === chosenHillName;
    button.classList.toggle("is-selected", isSelected);
    button.classList.remove("is-active-option");
    button.setAttribute("aria-selected", String(isSelected));
    button.disabled = choiceLocked;
  });
}

async function openDialogue(text, runId, showOptions = false, showOptionsImmediately = false) {
  clearDialogueReservation();
  dialogueTextEl.textContent = "";
  dialogueOptionsEl.innerHTML = "";
  dialogueOptionsEl.classList.add("hidden");
  hideDialogueContinue();
  dialogueShellEl.classList.toggle("has-options", showOptions);
  dialogueShellEl.classList.add("is-active");
  dialogueShellEl.classList.add("is-measuring");
  dialogueShellEl.setAttribute("aria-hidden", "false");

  if (showOptions) {
    renderOptions(true);
    dialogueOptionsEl.classList.remove("hidden");
  }

  dialogueTextEl.textContent = text;

  await nextFrame();

  dialogueShellEl.style.width = `${Math.ceil(dialogueShellEl.offsetWidth)}px`;
  dialoguePanelEl.style.minHeight = `${Math.ceil(dialoguePanelEl.offsetHeight)}px`;
  dialogueTextEl.style.minHeight = `${Math.ceil(dialogueTextEl.offsetHeight)}px`;

  dialogueTextEl.textContent = "";

  if (!(showOptions && showOptionsImmediately)) {
    dialogueOptionsEl.innerHTML = "";
    dialogueOptionsEl.classList.add("hidden");
  }

  await nextFrame();
  dialogueShellEl.classList.remove("is-measuring");

  if (!(await pauseFor(220, runId))) {
    return false;
  }

  if (!(await typeInto(dialogueTextEl, text, runId, 24))) {
    return false;
  }

  if (!showOptions) {
    return true;
  }

  if (!showOptionsImmediately) {
    if (!(await pauseFor(220, runId))) {
      return false;
    }

    renderOptions(false);
    dialogueOptionsEl.classList.remove("hidden");
  }

  setOptionInteractivity(false);
  setActiveOptionByIndex(activeOptionIndex);

  return true;
}

async function closeDialogue(runId) {
  hideDialogueContinue();
  dialogueShellEl.classList.remove("is-active");
  dialogueShellEl.classList.remove("is-measuring");
  dialogueShellEl.classList.remove("has-options");
  dialogueShellEl.setAttribute("aria-hidden", "true");
  return pauseFor(320, runId);
}

function resolveDialogueAdvance() {
  if (!awaitingDialogueAdvance) {
    return;
  }

  awaitingDialogueAdvance = false;
  hideDialogueContinue();

  const resolve = dialogueAdvanceResolve;
  dialogueAdvanceResolve = null;

  if (resolve) {
    resolve(true);
  }
}

function waitForDialogueAdvance(runId) {
  awaitingDialogueAdvance = true;
  showDialogueContinue();

  return new Promise((resolve) => {
    dialogueAdvanceResolve = async () => {
      resolve(activeRun === runId);
    };
  });
}

async function animatePoemRename(hillName, runId) {
  if (!poemNameTarget || poemNameTarget.textContent === hillName) {
    return;
  }

  poemNameTarget.classList.remove("rewritten");
  poemNameTarget.classList.add("crossing-out");

  if (!(await pauseFor(760, runId))) {
    return;
  }

  poemNameTarget.classList.remove("crossing-out");
  poemNameTarget.textContent = hillName;

  void poemNameTarget.offsetWidth;
  poemNameTarget.classList.add("rewritten");

  if (!(await pauseFor(1100, runId))) {
    return;
  }

  poemNameTarget.classList.remove("rewritten");
}

async function animateTitleRename(hillName, runId) {
  if (!titleNameTarget || titleNameTarget.textContent === hillName) {
    return;
  }

  titleNameTarget.classList.add("is-fading");

  if (!(await pauseFor(980, runId))) {
    return;
  }

  titleNameTarget.textContent = hillName;
  titleNameTarget.classList.remove("is-fading");
  titleNameTarget.classList.add("is-renamed");

  if (!(await pauseFor(1200, runId))) {
    return;
  }

  titleNameTarget.classList.remove("is-renamed");
}

async function fadeOutSceneText(runId) {
  hideDialogueContinue();
  titleCardEl.classList.add("is-clearing");
  poemCardEl.classList.add("is-clearing");

  return pauseFor(2600, runId);
}

async function showEndCard(runId) {
  endCardEl.classList.add("is-visible");
  endCardEl.setAttribute("aria-hidden", "false");
  return pauseFor(1200, runId);
}

async function handleChoice(chosenHillName) {
  if (choiceLocked) {
    return;
  }

  choiceLocked = true;
  const runId = activeRun;

  setSelectedOption(chosenHillName);

  if (!(await pauseFor(180, runId))) {
    return;
  }

  if (!(await closeDialogue(runId))) {
    return;
  }

  const responseText =
    chosenHillName === DEFAULT_HILL_NAME ? MENU_KEEP_RESPONSE : MENU_RENAME_RESPONSE;

  if (!(await openDialogue(responseText, runId))) {
    return;
  }

  if (chosenHillName !== DEFAULT_HILL_NAME) {
    if (!(await pauseFor(320, runId))) {
      return;
    }

    await Promise.all([
      animateTitleRename(chosenHillName, runId),
      animatePoemRename(chosenHillName, runId),
    ]);
  }

  if (!(await waitForDialogueAdvance(runId))) {
    return;
  }

  if (!(await closeDialogue(runId))) {
    return;
  }

  if (!(await fadeOutSceneText(runId))) {
    return;
  }

  await Promise.all([
    showEndCard(runId),
    fadeOutPreludeAudio(runId),
  ]);
}

function handleKeyboardSelection(event) {
  if (awaitingDialogueAdvance) {
    if (event.key === "Enter" || event.key === " " || event.key === "z" || event.key === "Z") {
      event.preventDefault();
      resolveDialogueAdvance();
    }

    return;
  }

  if (dialogueOptionsEl.classList.contains("hidden") || choiceLocked) {
    return;
  }

  const buttons = [...dialogueOptionsEl.querySelectorAll(".dialogue-option")];
  if (!buttons.length) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveOptionByIndex((activeOptionIndex + 1) % buttons.length);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveOptionByIndex((activeOptionIndex - 1 + buttons.length) % buttons.length);
    return;
  }

  if (event.key === "Enter" || event.key === "z" || event.key === "Z") {
    event.preventDefault();
    buttons[activeOptionIndex]?.click();
    return;
  }

  const numericChoice = Number.parseInt(event.key, 10);
  if (!Number.isNaN(numericChoice) && numericChoice >= 1 && numericChoice <= buttons.length) {
    event.preventDefault();
    buttons[numericChoice - 1].click();
  }
}

async function playPrelude() {
  activeRun += 1;
  const runId = activeRun;

  resetSceneState();
  renderTitleCard(DEFAULT_HILL_NAME);

  void startPreludeAudio();

  if (!(await pauseFor(700, runId))) {
    return;
  }

  window.requestAnimationFrame(() => {
    if (activeRun === runId) {
      nightImageEl.classList.add("is-visible");
    }
  });

  titleCardEl.classList.add("is-visible");

  if (!(await pauseFor(2500, runId))) {
    return;
  }

  if (!(await revealPoem(runId))) {
    return;
  }

  if (!(await pauseFor(1200, runId))) {
    return;
  }

  if (!(await openDialogue(MENU_INTRO_PART_ONE, runId))) {
    return;
  }

  if (!(await waitForDialogueAdvance(runId))) {
    return;
  }

  if (!(await closeDialogue(runId))) {
    return;
  }

  if (!(await openDialogue(MENU_INTRO_PART_TWO, runId))) {
    return;
  }

  if (!(await waitForDialogueAdvance(runId))) {
    return;
  }

  if (!(await closeDialogue(runId))) {
    return;
  }

  await openDialogue(MENU_INTRO_PART_THREE, runId, true, true);
}

function initializePrelude() {
  queueStageScale();
  resetSceneState();
  showStartOverlay();
}

document.addEventListener("keydown", handleKeyboardSelection);
dialogueShellEl.addEventListener("click", () => {
  resolveDialogueAdvance();
});
startButtonEl.addEventListener("click", () => {
  hideStartOverlay();
  void playPrelude();
});
window.addEventListener("resize", queueStageScale);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", queueStageScale);
}

initializePrelude();
