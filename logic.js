(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WordTrainerLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MODES = ["enToJa", "jaToEn"];
  const ALL_PARTS = [
    "名詞",
    "動詞",
    "形容詞",
    "副詞",
    "前置詞",
    "冠詞",
    "代名詞",
    "接続詞",
    "間投詞",
    "その他",
  ];

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("ja");
  }

  function createDefaultData() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      settings: {
        mode: "enToJa",
        selectedParts: [],
        starredOnly: false,
      },
      modes: {
        enToJa: { words: {} },
        jaToEn: { words: {} },
      },
    };
  }

  function promptFor(word, mode) {
    return mode === "enToJa" ? word.word : word.meaning;
  }

  function answerFor(word, mode) {
    return mode === "enToJa" ? word.meaning : word.word;
  }

  function buildPromptIndex(words, mode) {
    const index = new Map();
    for (const word of words) {
      const prompt = normalizeText(promptFor(word, mode));
      const answer = normalizeText(answerFor(word, mode));
      if (!index.has(prompt)) index.set(prompt, new Set());
      index.get(prompt).add(answer);
    }
    return index;
  }

  function isUnambiguous(word, words, mode, promptIndex) {
    const index = promptIndex || buildPromptIndex(words, mode);
    const answers = index.get(normalizeText(promptFor(word, mode)));
    return Boolean(answers && answers.size === 1);
  }

  function filterWords(words, settings) {
    const selectedParts = Array.isArray(settings.selectedParts)
      ? settings.selectedParts
      : [];
    return words.filter((word) => {
      if (settings.starredOnly && !word.starred) return false;
      if (!selectedParts.length) return true;
      return word.partsOfSpeech.some((part) => selectedParts.includes(part));
    });
  }

  function eligibleQuestions(words, settings, mode) {
    const promptIndex = buildPromptIndex(words, mode);
    return filterWords(words, settings).filter((word) =>
      isUnambiguous(word, words, mode, promptIndex),
    );
  }

  function getEntry(data, mode, wordId) {
    return data?.modes?.[mode]?.words?.[wordId] || null;
  }

  function questionWeight(word, data, mode, recentQuestionIds) {
    const entry = getEntry(data, mode, word.id);
    let weight;
    if (!entry || entry.attempts === 0) {
      weight = 5;
    } else {
      const accuracy = entry.correct / entry.attempts;
      const difficulty = 1 + (1 - accuracy) * 4;
      const coverage = 1 / Math.sqrt(1 + entry.attempts * 0.35);
      const recent = Array.isArray(entry.recentResults)
        ? entry.recentResults
        : [];
      const lastWasWrong = recent.length && recent[recent.length - 1] === 0;
      const recentWrongCount = recent.slice(-4).filter((result) => result === 0).length;
      weight = Math.max(0.35, difficulty * coverage + recentWrongCount * 0.8);
      if (lastWasWrong) weight += 2.4;
    }

    const position = recentQuestionIds.indexOf(word.id);
    if (position === 0) weight *= 0.03;
    else if (position === 1) weight *= 0.18;
    else if (position === 2) weight *= 0.5;
    return Math.max(0.01, weight);
  }

  function weightedPick(items, weightOf, random = Math.random) {
    if (!items.length) return null;
    const weights = items.map((item) => Math.max(0, Number(weightOf(item)) || 0));
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return items[Math.floor(random() * items.length)];
    let cursor = random() * total;
    for (let index = 0; index < items.length; index += 1) {
      cursor -= weights[index];
      if (cursor < 0) return items[index];
    }
    return items[items.length - 1];
  }

  function weightedSample(items, count, weightOf, random = Math.random) {
    const remaining = items.slice();
    const chosen = [];
    while (remaining.length && chosen.length < count) {
      const item = weightedPick(remaining, weightOf, random);
      chosen.push(item);
      remaining.splice(remaining.indexOf(item), 1);
    }
    return chosen;
  }

  function shuffle(items, random = Math.random) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function distractorCandidates(correctWord, allWords, mode) {
    const correctAnswer = normalizeText(answerFor(correctWord, mode));
    const seenAnswers = new Set([correctAnswer]);
    const candidates = [];
    for (const word of allWords) {
      if (word.id === correctWord.id) continue;
      const answer = normalizeText(answerFor(word, mode));
      if (!answer || seenAnswers.has(answer)) continue;
      seenAnswers.add(answer);
      candidates.push(word);
    }
    return candidates;
  }

  function createQuestion(options) {
    const {
      words,
      settings,
      mode,
      data,
      recentQuestionIds = [],
      random = Math.random,
    } = options;
    const eligible = eligibleQuestions(words, settings, mode).filter(
      (word) => distractorCandidates(word, words, mode).length >= 3,
    );
    if (!eligible.length) return null;

    const correctWord = weightedPick(
      eligible,
      (word) => questionWeight(word, data, mode, recentQuestionIds),
      random,
    );
    const entry = getEntry(data, mode, correctWord.id);
    const wrongHistory = entry?.wrongChoices || {};
    const candidates = distractorCandidates(correctWord, words, mode);
    const distractors = weightedSample(
      candidates,
      3,
      (word) => 1 + Math.min(8, Number(wrongHistory[word.id]) || 0) * 3.5,
      random,
    );
    if (distractors.length < 3) return null;

    const optionWords = shuffle([correctWord, ...distractors], random);
    return {
      wordId: correctWord.id,
      prompt: promptFor(correctWord, mode),
      answer: answerFor(correctWord, mode),
      example: correctWord.example,
      sourceNo: correctWord.sourceNo,
      partsOfSpeech: correctWord.partsOfSpeech.slice(),
      starred: correctWord.starred,
      answered: false,
      options: optionWords.map((word) => ({
        id: word.id,
        text: answerFor(word, mode),
        correct: word.id === correctWord.id,
      })),
    };
  }

  function ensureMode(data, mode) {
    if (!data.modes) data.modes = {};
    if (!data.modes[mode]) data.modes[mode] = { words: {} };
    if (!data.modes[mode].words) data.modes[mode].words = {};
    return data.modes[mode];
  }

  function commitAnswer(question, data, mode, selectedId) {
    if (!question || question.answered) return { recorded: false };
    const selected = question.options.find((option) => option.id === selectedId);
    if (!selected) return { recorded: false };
    question.answered = true;

    const modeData = ensureMode(data, mode);
    const entry = modeData.words[question.wordId] || {
      attempts: 0,
      correct: 0,
      recentResults: [],
      lastAnsweredAt: null,
      wrongChoices: {},
    };
    const isCorrect = Boolean(selected.correct);
    entry.attempts += 1;
    if (isCorrect) entry.correct += 1;
    entry.recentResults = [...entry.recentResults, isCorrect ? 1 : 0].slice(-8);
    entry.lastAnsweredAt = new Date().toISOString();

    if (!isCorrect) {
      entry.wrongChoices[selectedId] = (entry.wrongChoices[selectedId] || 0) + 1;
      entry.wrongChoices = Object.fromEntries(
        Object.entries(entry.wrongChoices)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12),
      );
    }

    modeData.words[question.wordId] = entry;
    data.updatedAt = new Date().toISOString();
    return { recorded: true, isCorrect, correctId: question.wordId };
  }

  function calculateModeStats(data, mode) {
    const entries = Object.values(data?.modes?.[mode]?.words || {});
    const attempts = entries.reduce((sum, entry) => sum + entry.attempts, 0);
    const correct = entries.reduce((sum, entry) => sum + entry.correct, 0);
    return {
      attempts,
      correct,
      incorrect: attempts - correct,
      accuracy: attempts ? correct / attempts : 0,
      studiedWords: entries.filter((entry) => entry.attempts > 0).length,
    };
  }

  function weakWords(words, data, mode, limit = 10) {
    return words
      .map((word) => {
        const entry = getEntry(data, mode, word.id);
        if (!entry || !entry.attempts) return null;
        const accuracy = entry.correct / entry.attempts;
        const lastWrong = entry.recentResults?.at(-1) === 0;
        const score = (1 - accuracy) * 100 + Math.min(entry.attempts, 8) + (lastWrong ? 18 : 0);
        return { word, entry, accuracy, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.entry.attempts - a.entry.attempts)
      .slice(0, limit);
  }

  function validateImport(candidate, words) {
    const ids = new Set(words.map((word) => word.id));
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("JSONの最上位はオブジェクトである必要があります。");
    }
    if (candidate.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`対応していないデータ形式です（version ${candidate.schemaVersion ?? "なし"}）。`);
    }
    if (!candidate.settings || !MODES.includes(candidate.settings.mode)) {
      throw new Error("学習モードの設定が不正です。");
    }
    if (!Array.isArray(candidate.settings.selectedParts)) {
      throw new Error("品詞設定が不正です。");
    }
    if (candidate.settings.selectedParts.some((part) => !ALL_PARTS.includes(part))) {
      throw new Error("不明な品詞が含まれています。");
    }
    if (typeof candidate.settings.starredOnly !== "boolean") {
      throw new Error("☆フィルターの設定が不正です。");
    }

    for (const mode of MODES) {
      const modeData = candidate.modes?.[mode];
      if (!modeData || typeof modeData.words !== "object" || Array.isArray(modeData.words)) {
        throw new Error(`${mode}の履歴が不正です。`);
      }
      for (const [wordId, entry] of Object.entries(modeData.words)) {
        if (!ids.has(wordId)) throw new Error(`存在しない単語IDです: ${wordId}`);
        if (!entry || typeof entry !== "object") throw new Error(`${wordId}の履歴が不正です。`);
        if (!Number.isInteger(entry.attempts) || entry.attempts < 0) throw new Error(`${wordId}の回答数が不正です。`);
        if (!Number.isInteger(entry.correct) || entry.correct < 0 || entry.correct > entry.attempts) {
          throw new Error(`${wordId}の正解数が不正です。`);
        }
        if (!Array.isArray(entry.recentResults) || entry.recentResults.length > 8 || entry.recentResults.some((v) => v !== 0 && v !== 1)) {
          throw new Error(`${wordId}の直近結果が不正です。`);
        }
        if (typeof entry.wrongChoices !== "object" || Array.isArray(entry.wrongChoices)) {
          throw new Error(`${wordId}の誤答履歴が不正です。`);
        }
        for (const [choiceId, count] of Object.entries(entry.wrongChoices)) {
          if (!ids.has(choiceId) || !Number.isInteger(count) || count < 1) {
            throw new Error(`${wordId}の誤答選択肢が不正です。`);
          }
        }
      }
    }
    return true;
  }

  return {
    SCHEMA_VERSION,
    MODES,
    ALL_PARTS,
    normalizeText,
    createDefaultData,
    promptFor,
    answerFor,
    buildPromptIndex,
    isUnambiguous,
    filterWords,
    eligibleQuestions,
    questionWeight,
    weightedPick,
    distractorCandidates,
    createQuestion,
    commitAnswer,
    calculateModeStats,
    weakWords,
    validateImport,
  };
});
