(function () {
  "use strict";

  const STORAGE_KEY = "habatan-word-trainer-v1";
  const PAGE_SIZE = 20;
  const words = Array.isArray(window.WORD_DATA) ? window.WORD_DATA : [];
  const logic = window.WordTrainerLogic;

  const elements = {
    appMessage: document.getElementById("app-message"),
    setupView: document.getElementById("setup-view"),
    quizView: document.getElementById("quiz-view"),
    statsView: document.getElementById("stats-view"),
    brandButton: document.getElementById("brand-button"),
    navStudy: document.getElementById("nav-study"),
    navStats: document.getElementById("nav-stats"),
    settingsForm: document.getElementById("settings-form"),
    partGrid: document.getElementById("part-grid"),
    clearParts: document.getElementById("clear-parts"),
    starredOnly: document.getElementById("starred-only"),
    totalWordCount: document.getElementById("total-word-count"),
    eligibleCount: document.getElementById("eligible-count"),
    summaryMode: document.getElementById("summary-mode"),
    summaryParts: document.getElementById("summary-parts"),
    summaryStar: document.getElementById("summary-star"),
    rangeNote: document.getElementById("range-note"),
    startButton: document.getElementById("start-button"),
    finishSession: document.getElementById("finish-session"),
    quizShell: document.querySelector(".quiz-shell"),
    questionKicker: document.getElementById("question-kicker"),
    quizHeading: document.getElementById("quiz-heading"),
    optionList: document.getElementById("option-list"),
    feedback: document.getElementById("feedback"),
    feedbackIcon: document.getElementById("feedback-icon"),
    feedbackTitle: document.getElementById("feedback-title"),
    feedbackAnswer: document.getElementById("feedback-answer"),
    exampleBlock: document.getElementById("example-block"),
    exampleText: document.getElementById("example-text"),
    nextButton: document.getElementById("next-button"),
    sessionAttempts: document.getElementById("session-attempts"),
    sessionCorrect: document.getElementById("session-correct"),
    sessionIncorrect: document.getElementById("session-incorrect"),
    sessionAccuracy: document.getElementById("session-accuracy"),
    statsModeButtons: [...document.querySelectorAll("[data-stats-mode]")],
    totalAttempts: document.getElementById("total-attempts"),
    totalCorrect: document.getElementById("total-correct"),
    totalIncorrect: document.getElementById("total-incorrect"),
    totalAccuracy: document.getElementById("total-accuracy"),
    studiedWords: document.getElementById("studied-words"),
    weakList: document.getElementById("weak-list"),
    statsSearch: document.getElementById("stats-search"),
    wordStatsBody: document.getElementById("word-stats-body"),
    previousPage: document.getElementById("previous-page"),
    nextPage: document.getElementById("next-page"),
    pageStatus: document.getElementById("page-status"),
    exportButton: document.getElementById("export-button"),
    importInput: document.getElementById("import-input"),
    resetButton: document.getElementById("reset-button"),
  };

  let data = loadData();
  let currentView = "setup";
  let currentQuestion = null;
  let currentMode = data.settings.mode;
  let recentQuestionIds = [];
  let session = { attempts: 0, correct: 0 };
  let statsMode = "enToJa";
  let statsPage = 1;
  let messageTimer = null;

  function showMessage(message, kind = "info") {
    window.clearTimeout(messageTimer);
    elements.appMessage.textContent = message;
    elements.appMessage.dataset.kind = kind;
    elements.appMessage.hidden = false;
    messageTimer = window.setTimeout(() => {
      elements.appMessage.hidden = true;
    }, 5200);
  }

  function loadData() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return logic.createDefaultData();
      const parsed = JSON.parse(raw);
      logic.validateImport(parsed, words);
      return parsed;
    } catch (error) {
      window.setTimeout(() => {
        showMessage(`保存データを読み込めなかったため、新しい履歴で開始します。${error.message}`, "error");
      }, 0);
      return logic.createDefaultData();
    }
  }

  function saveData(options = {}) {
    try {
      data.updatedAt = new Date().toISOString();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      if (!options.quiet) {
        showMessage("履歴を保存できませんでした。ブラウザの保存設定や空き容量を確認してください。", "error");
      }
      return false;
    }
  }

  function percent(value) {
    return `${Math.round(value * 100)}%`;
  }

  function partCounts() {
    return logic.ALL_PARTS.map((part) => ({
      part,
      count: words.filter((word) => word.partsOfSpeech.includes(part)).length,
    }));
  }

  function renderPartChoices() {
    const fragment = document.createDocumentFragment();
    for (const { part, count } of partCounts()) {
      const label = document.createElement("label");
      label.className = "part-chip";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "part";
      input.value = part;
      input.checked = data.settings.selectedParts.includes(part);
      const text = document.createElement("span");
      text.textContent = `${part} ${count}`;
      label.append(input, text);
      fragment.append(label);
    }
    elements.partGrid.replaceChildren(fragment);
  }

  function settingsFromForm() {
    const mode = elements.settingsForm.elements.mode.value;
    const selectedParts = [...elements.settingsForm.querySelectorAll('input[name="part"]:checked')]
      .map((input) => input.value);
    return {
      mode,
      selectedParts,
      starredOnly: elements.starredOnly.checked,
    };
  }

  function applySettingsToForm() {
    const modeInput = elements.settingsForm.querySelector(
      `input[name="mode"][value="${data.settings.mode}"]`,
    );
    if (modeInput) modeInput.checked = true;
    elements.starredOnly.checked = data.settings.starredOnly;
    for (const input of elements.settingsForm.querySelectorAll('input[name="part"]')) {
      input.checked = data.settings.selectedParts.includes(input.value);
    }
  }

  function updateSettingsSummary() {
    const settings = settingsFromForm();
    data.settings = settings;
    saveData({ quiet: true });
    const eligible = logic.eligibleQuestions(words, settings, settings.mode);
    elements.eligibleCount.textContent = eligible.length.toLocaleString("ja-JP");
    elements.summaryMode.textContent = settings.mode === "enToJa" ? "英単語 → 日本語" : "日本語 → 英単語";
    elements.summaryParts.textContent = settings.selectedParts.length
      ? settings.selectedParts.join("・")
      : "全品詞";
    elements.summaryStar.textContent = settings.starredOnly ? "☆付きのみ" : "すべて";
    elements.startButton.disabled = eligible.length === 0;
    elements.rangeNote.textContent = eligible.length
      ? "問題数に上限はありません。終了するまで続けられます。"
      : "この条件では、一意な4択問題を作成できる単語がありません。";
  }

  function setView(name) {
    currentView = name;
    elements.setupView.hidden = name !== "setup";
    elements.quizView.hidden = name !== "quiz";
    elements.statsView.hidden = name !== "stats";
    elements.navStudy.classList.toggle("is-active", name === "setup" || name === "quiz");
    elements.navStats.classList.toggle("is-active", name === "stats");
    if (name === "stats") renderStats();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateSessionStats() {
    const incorrect = session.attempts - session.correct;
    elements.sessionAttempts.textContent = session.attempts;
    elements.sessionCorrect.textContent = session.correct;
    elements.sessionIncorrect.textContent = incorrect;
    elements.sessionAccuracy.textContent = percent(
      session.attempts ? session.correct / session.attempts : 0,
    );
  }

  function startSession() {
    data.settings = settingsFromForm();
    currentMode = data.settings.mode;
    session = { attempts: 0, correct: 0 };
    recentQuestionIds = [];
    updateSessionStats();
    setView("quiz");
    showNextQuestion();
  }

  function showNextQuestion() {
    if (currentQuestion) {
      recentQuestionIds.unshift(currentQuestion.wordId);
      recentQuestionIds = recentQuestionIds.slice(0, 6);
    }
    currentQuestion = logic.createQuestion({
      words,
      settings: data.settings,
      mode: currentMode,
      data,
      recentQuestionIds,
    });
    if (!currentQuestion) {
      showMessage("この範囲では4択問題を作成できません。設定を変更してください。", "error");
      setView("setup");
      return;
    }

    elements.quizShell.classList.remove("has-feedback");
    elements.feedback.hidden = true;
    elements.feedback.removeAttribute("data-result");
    elements.exampleBlock.hidden = true;
    elements.questionKicker.textContent = currentMode === "enToJa"
      ? "英単語の意味を選んでください"
      : "意味に合う英単語を選んでください";
    elements.quizHeading.textContent = currentQuestion.prompt;

    const fragment = document.createDocumentFragment();
    currentQuestion.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.dataset.optionId = option.id;
      button.setAttribute("aria-label", `${index + 1}. ${option.text}`);
      const number = document.createElement("span");
      number.className = "option-number";
      number.textContent = index + 1;
      const text = document.createElement("span");
      text.textContent = option.text;
      button.append(number, text);
      button.addEventListener("click", () => answerQuestion(option.id));
      fragment.append(button);
    });
    elements.optionList.replaceChildren(fragment);
    elements.optionList.querySelector("button")?.focus();
  }

  function answerQuestion(selectedId) {
    const result = logic.commitAnswer(currentQuestion, data, currentMode, selectedId);
    if (!result.recorded) return;
    saveData();
    session.attempts += 1;
    if (result.isCorrect) session.correct += 1;
    updateSessionStats();

    for (const button of elements.optionList.querySelectorAll("button")) {
      button.disabled = true;
      const option = currentQuestion.options.find(
        (candidate) => candidate.id === button.dataset.optionId,
      );
      if (option.correct) button.classList.add("is-correct");
      else if (option.id === selectedId) button.classList.add("is-wrong");
    }

    elements.feedback.dataset.result = result.isCorrect ? "correct" : "wrong";
    elements.feedbackIcon.textContent = result.isCorrect ? "✓" : "×";
    elements.feedbackTitle.textContent = result.isCorrect ? "正解です" : "不正解です";
    elements.feedbackAnswer.textContent = result.isCorrect
      ? `答え：${currentQuestion.answer}`
      : `正解：${currentQuestion.answer}`;
    if (currentQuestion.example) {
      elements.exampleText.textContent = currentQuestion.example;
      elements.exampleBlock.hidden = false;
    } else {
      elements.exampleBlock.hidden = true;
    }
    elements.feedback.hidden = false;
    elements.quizShell.classList.add("has-feedback");
    window.setTimeout(() => elements.nextButton.focus(), 0);
  }

  function renderStats() {
    const stats = logic.calculateModeStats(data, statsMode);
    elements.totalAttempts.textContent = stats.attempts.toLocaleString("ja-JP");
    elements.totalCorrect.textContent = stats.correct.toLocaleString("ja-JP");
    elements.totalIncorrect.textContent = stats.incorrect.toLocaleString("ja-JP");
    elements.totalAccuracy.textContent = percent(stats.accuracy);
    elements.studiedWords.textContent = stats.studiedWords.toLocaleString("ja-JP");

    for (const button of elements.statsModeButtons) {
      button.setAttribute("aria-selected", String(button.dataset.statsMode === statsMode));
    }
    renderWeakWords();
    renderWordStats();
  }

  function renderWeakWords() {
    const weak = logic.weakWords(words, data, statsMode, 10);
    if (!weak.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "まだ回答記録がありません。";
      elements.weakList.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of weak) {
      const article = document.createElement("article");
      article.className = "weak-item";
      const detail = document.createElement("div");
      const word = document.createElement("strong");
      word.textContent = item.word.word;
      const meaning = document.createElement("span");
      meaning.textContent = item.word.meaning;
      detail.append(word, meaning);
      const score = document.createElement("span");
      score.className = "weak-score";
      score.textContent = `${item.entry.correct}/${item.entry.attempts}・${percent(item.accuracy)}`;
      article.append(detail, score);
      fragment.append(article);
    }
    elements.weakList.replaceChildren(fragment);
  }

  function filteredStatsWords() {
    const query = logic.normalizeText(elements.statsSearch.value);
    if (!query) return words;
    return words.filter((word) =>
      logic.normalizeText(`${word.word} ${word.meaning}`).includes(query),
    );
  }

  function renderRecent(entry) {
    if (!entry?.recentResults?.length) return document.createTextNode("—");
    const wrap = document.createElement("span");
    wrap.className = "recent-dots";
    wrap.setAttribute(
      "aria-label",
      entry.recentResults.map((result) => (result ? "正解" : "不正解")).join("、"),
    );
    for (const result of entry.recentResults) {
      const dot = document.createElement("i");
      if (!result) dot.className = "is-wrong";
      dot.setAttribute("aria-hidden", "true");
      wrap.append(dot);
    }
    return wrap;
  }

  function renderWordStats() {
    const filtered = filteredStatsWords();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    statsPage = Math.min(statsPage, totalPages);
    const pageWords = filtered.slice((statsPage - 1) * PAGE_SIZE, statsPage * PAGE_SIZE);
    const fragment = document.createDocumentFragment();

    for (const word of pageWords) {
      const entry = data.modes[statsMode].words[word.id];
      const attempts = entry?.attempts || 0;
      const correct = entry?.correct || 0;
      const row = document.createElement("tr");
      const values = [
        word.word,
        word.meaning,
        word.partsOfSpeech.join("・"),
        attempts.toLocaleString("ja-JP"),
        correct.toLocaleString("ja-JP"),
        attempts ? percent(correct / attempts) : "—",
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      const recentCell = document.createElement("td");
      recentCell.append(renderRecent(entry));
      row.append(recentCell);
      fragment.append(row);
    }

    if (!pageWords.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "該当する単語はありません。";
      row.append(cell);
      fragment.append(row);
    }

    elements.wordStatsBody.replaceChildren(fragment);
    elements.pageStatus.textContent = `${statsPage} / ${totalPages}`;
    elements.previousPage.disabled = statsPage <= 1;
    elements.nextPage.disabled = statsPage >= totalPages;
  }

  function exportData() {
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `英単語トレーニング履歴_${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage("学習履歴を書き出しました。");
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const candidate = JSON.parse(text);
      logic.validateImport(candidate, words);
      const confirmed = window.confirm(
        "現在の学習履歴と設定を、読み込んだデータで上書きします。よろしいですか？",
      );
      if (!confirmed) return;
      data = candidate;
      saveData();
      applySettingsToForm();
      updateSettingsSummary();
      statsPage = 1;
      renderStats();
      showMessage("学習履歴を読み込みました。");
    } catch (error) {
      showMessage(`読み込みに失敗しました。${error.message}`, "error");
    } finally {
      elements.importInput.value = "";
    }
  }

  function resetHistory() {
    const confirmed = window.confirm(
      "英→日・日→英のすべての学習履歴を削除します。この操作は元に戻せません。よろしいですか？",
    );
    if (!confirmed) return;
    const settings = { ...data.settings, selectedParts: [...data.settings.selectedParts] };
    data = logic.createDefaultData();
    data.settings = settings;
    saveData();
    statsPage = 1;
    renderStats();
    showMessage("学習履歴をリセットしました。");
  }

  function handleKeyboard(event) {
    if (currentView !== "quiz" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!currentQuestion?.answered && /^[1-4]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const option = currentQuestion.options[index];
      if (option) {
        event.preventDefault();
        answerQuestion(option.id);
      }
      return;
    }
    if (currentQuestion?.answered && (event.key === "Enter" || event.key === " " || event.key.toLowerCase() === "n")) {
      event.preventDefault();
      showNextQuestion();
    }
  }

  function bindEvents() {
    elements.settingsForm.addEventListener("change", updateSettingsSummary);
    elements.settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!elements.startButton.disabled) startSession();
    });
    elements.clearParts.addEventListener("click", () => {
      for (const input of elements.settingsForm.querySelectorAll('input[name="part"]')) {
        input.checked = false;
      }
      updateSettingsSummary();
    });
    elements.brandButton.addEventListener("click", () => setView("setup"));
    elements.navStudy.addEventListener("click", () => setView("setup"));
    elements.navStats.addEventListener("click", () => setView("stats"));
    elements.finishSession.addEventListener("click", () => setView("setup"));
    elements.nextButton.addEventListener("click", showNextQuestion);
    elements.statsModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        statsMode = button.dataset.statsMode;
        statsPage = 1;
        renderStats();
      });
    });
    elements.statsSearch.addEventListener("input", () => {
      statsPage = 1;
      renderWordStats();
    });
    elements.previousPage.addEventListener("click", () => {
      statsPage = Math.max(1, statsPage - 1);
      renderWordStats();
    });
    elements.nextPage.addEventListener("click", () => {
      statsPage += 1;
      renderWordStats();
    });
    elements.exportButton.addEventListener("click", exportData);
    elements.importInput.addEventListener("change", () => {
      const [file] = elements.importInput.files;
      if (file) importData(file);
    });
    elements.resetButton.addEventListener("click", resetHistory);
    document.addEventListener("keydown", handleKeyboard);
  }

  function initialize() {
    if (!words.length || !logic) {
      showMessage("単語データを読み込めませんでした。ファイル構成を確認してください。", "error");
      elements.startButton.disabled = true;
      return;
    }
    elements.totalWordCount.textContent = words.length.toLocaleString("ja-JP");
    renderPartChoices();
    applySettingsToForm();
    updateSettingsSummary();
    bindEvents();
  }

  initialize();
})();
