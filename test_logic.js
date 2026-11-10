const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const logic = require("./logic.js");

const dataSource = fs.readFileSync("./words.js", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(dataSource, context);
const words = context.window.WORD_DATA;

assert.equal(words.length, 822, "Excel由来の822語を保持する");
assert.equal(new Set(words.map((word) => word.id)).size, 822, "IDは重複しない");
assert.equal(words.filter((word) => word.starred).length, 23, "☆付き件数を保持する");

const compound = words.find((word) => word.posSource === "副・名");
assert.deepEqual(Array.from(compound.partsOfSpeech), ["副詞", "名詞"], "複数品詞を両方に含める");

const nounOrVerb = logic.filterWords(words, {
  selectedParts: ["名詞", "動詞"],
  starredOnly: false,
});
assert(nounOrVerb.every((word) => word.partsOfSpeech.some((part) => part === "名詞" || part === "動詞")));

const japanesePrompts = logic.eligibleQuestions(
  words,
  { selectedParts: [], starredOnly: false },
  "jaToEn",
);
assert.equal(japanesePrompts.length, 816, "意味が同一の3組6語は曖昧問題から除外する");

const history = logic.createDefaultData();
const question = logic.createQuestion({
  words,
  settings: { selectedParts: [], starredOnly: false },
  mode: "enToJa",
  data: history,
  random: () => 0.42,
});
assert(question, "4択問題を生成できる");
assert.equal(question.options.length, 4);
assert.equal(question.options.filter((option) => option.correct).length, 1, "正解は1つ");
assert.equal(new Set(question.options.map((option) => logic.normalizeText(option.text))).size, 4, "選択肢は重複しない");

const chosen = question.options[0];
const first = logic.commitAnswer(question, history, "enToJa", chosen.id);
const second = logic.commitAnswer(question, history, "enToJa", chosen.id);
assert.equal(first.recorded, true);
assert.equal(second.recorded, false, "同じ問題を重複記録しない");
assert.equal(history.modes.enToJa.words[question.wordId].attempts, 1);

assert.equal(logic.validateImport(history, words), true, "正常なエクスポート形式を受理する");
const invalid = JSON.parse(JSON.stringify(history));
invalid.modes.enToJa.words[question.wordId].correct = 99;
assert.throws(() => logic.validateImport(invalid, words), /正解数/);

console.log("logic tests: OK");
