"use strict";

const TreeCO2Calculator = (() => {
  const MAX_CIRCUMFERENCE_CM = 6000;
  const MAX_TREE_COUNT = 1_000_000_000;
  const STORAGE_KEY = "tree-co2-calculator-state-v1";
  const VALID_UNITS = new Set(["mm", "cm", "m"]);
  const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const INTEGER_PATTERN = /^\d+$/;

  function convertToCentimeters(value, unit) {
    const factors = { mm: 0.1, cm: 1, m: 100 };
    if (!Number.isFinite(value) || !Object.prototype.hasOwnProperty.call(factors, unit)) {
      return Number.NaN;
    }
    return value * factors[unit];
  }

  function calculateDiameter(circumferenceCm) {
    return circumferenceCm / Math.PI;
  }

  function calculateAnnualCO2(diameterCm) {
    return 0.111 * (Math.pow(diameterCm + 1.1, 2.6173) - Math.pow(diameterCm, 2.6173));
  }

  function validateCircumference(rawValue, unit) {
    const valueText = String(rawValue ?? "").trim();
    if (valueText === "") {
      return { valid: false, message: "この欄は必須です．胸高周囲長を入力してください．" };
    }
    if (!DECIMAL_PATTERN.test(valueText)) {
      return { valid: false, message: "胸高周囲長は数字で入力してください．" };
    }

    const value = Number(valueText);
    if (!Number.isFinite(value)) {
      return { valid: false, message: "有限の数値を入力してください．" };
    }
    if (value <= 0) {
      return { valid: false, message: "胸高周囲長は0より大きい値を入力してください．" };
    }
    if (!VALID_UNITS.has(unit)) {
      return { valid: false, message: "入力単位が正しくありません．" };
    }

    const centimeters = convertToCentimeters(value, unit);
    if (!Number.isFinite(centimeters)) {
      return { valid: false, message: "入力値が大きすぎます．単位や入力値を確認してください．" };
    }
    if (centimeters > MAX_CIRCUMFERENCE_CM) {
      return {
        valid: false,
        message: "入力された胸高周囲長が大きすぎます．60 m以下になるよう，単位や入力値を確認してください．"
      };
    }
    return { valid: true, value, centimeters };
  }

  function validateTreeCount(rawValue) {
    const valueText = String(rawValue ?? "").trim();
    if (valueText === "") {
      return { valid: true, value: null };
    }
    if (!INTEGER_PATTERN.test(valueText)) {
      return { valid: false, message: "本数は1以上の整数で入力してください．" };
    }

    const value = Number(valueText);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return { valid: false, message: "本数は有限の整数で入力してください．" };
    }
    if (value <= 0) {
      return { valid: false, message: "本数は1以上で入力してください．" };
    }
    if (value > MAX_TREE_COUNT) {
      return { valid: false, message: "本数は10億本以下で入力してください．" };
    }
    return { valid: true, value };
  }

  function numberParts(value) {
    const absolute = Math.abs(value);
    if (Number.isFinite(value) && absolute !== 0 && (absolute >= 1_000_000_000 || absolute < 0.001)) {
      const [mantissa, exponent] = value.toExponential(3).split("e");
      return {
        scientific: true,
        mantissa,
        exponent: String(Number(exponent))
      };
    }
    return {
      scientific: false,
      text: new Intl.NumberFormat("ja-JP", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
      }).format(value)
    };
  }

  function sanitizeStoredState(candidate) {
    const safe = {
      circumference: "",
      unit: "cm",
      treeCount: "",
      defaultUnit: "cm"
    };
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return safe;
    }

    if (VALID_UNITS.has(candidate.defaultUnit)) {
      safe.defaultUnit = candidate.defaultUnit;
    }
    safe.unit = VALID_UNITS.has(candidate.unit) ? candidate.unit : safe.defaultUnit;

    if (typeof candidate.circumference === "string" && candidate.circumference.length <= 100) {
      const text = candidate.circumference.trim();
      const validation = validateCircumference(text, safe.unit);
      if (text === "" || validation.valid) {
        safe.circumference = candidate.circumference;
      }
    }
    if (typeof candidate.treeCount === "string" && candidate.treeCount.length <= 20) {
      const text = candidate.treeCount.trim();
      const validation = validateTreeCount(text);
      if (validation.valid) {
        safe.treeCount = candidate.treeCount;
      }
    }
    return safe;
  }

  function readStoredState(storage) {
    try {
      const saved = storage.getItem(STORAGE_KEY);
      return saved === null ? sanitizeStoredState(null) : sanitizeStoredState(JSON.parse(saved));
    } catch {
      return sanitizeStoredState(null);
    }
  }

  function writeStoredState(storage, state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStoredState(state)));
      return true;
    } catch {
      return false;
    }
  }

  function initializeUI(doc, storage) {
    const form = doc.getElementById("calculator-form");
    if (!form) return;

    const elements = {
      form,
      circumference: doc.getElementById("circumference"),
      unit: doc.getElementById("unit"),
      treeCount: doc.getElementById("tree-count"),
      circumferenceError: doc.getElementById("circumference-error"),
      treeCountError: doc.getElementById("tree-count-error"),
      calculateButton: doc.getElementById("calculate-button"),
      resetButton: doc.getElementById("reset-button"),
      resultsCard: doc.getElementById("results-card"),
      resultsEmpty: doc.getElementById("results-empty"),
      resultsContent: doc.getElementById("results-content"),
      oneTreeHighlightValue: doc.getElementById("one-tree-highlight-value"),
      diameterTableValue: doc.getElementById("diameter-table-value"),
      oneTreeValue: doc.getElementById("one-tree-value"),
      tenTreesValue: doc.getElementById("ten-trees-value"),
      customCountRow: doc.getElementById("custom-count-row"),
      customCountLabel: doc.getElementById("custom-count-label"),
      customCountValue: doc.getElementById("custom-count-value"),
      defaultUnit: doc.getElementById("default-unit"),
      resetSettingsButton: doc.getElementById("reset-settings-button"),
      settingsStatus: doc.getElementById("settings-status")
    };

    let state = readStoredState(storage);
    elements.circumference.value = state.circumference;
    elements.unit.value = state.unit;
    elements.treeCount.value = state.treeCount;
    elements.defaultUnit.value = state.defaultUnit;

    function currentState() {
      return {
        circumference: elements.circumference.value,
        unit: elements.unit.value,
        treeCount: elements.treeCount.value,
        defaultUnit: elements.defaultUnit.value
      };
    }

    function saveInputs() {
      state = currentState();
      writeStoredState(storage, state);
    }

    function setFieldError(input, errorElement, message = "") {
      input.setAttribute("aria-invalid", message ? "true" : "false");
      errorElement.textContent = message;
    }

    function renderNumber(element, value, suffix = "") {
      const parts = numberParts(value);
      element.replaceChildren();
      if (!parts.scientific) {
        element.textContent = `${parts.text}${suffix}`;
        return;
      }

      const wrapper = doc.createElement("span");
      wrapper.setAttribute("aria-label", `${parts.mantissa} かける 10 の ${parts.exponent} 乗${suffix}`);
      wrapper.append(`${parts.mantissa} × 10`);
      const superscript = doc.createElement("sup");
      superscript.textContent = parts.exponent;
      wrapper.append(superscript, suffix);
      element.append(wrapper);
    }

    function showLoading(isLoading) {
      elements.calculateButton.classList.toggle("is-loading", isLoading);
      elements.calculateButton.disabled = isLoading;
      elements.resultsCard.setAttribute("aria-busy", String(isLoading));
      elements.calculateButton.querySelector(".button-label").textContent = isLoading ? "計算中" : "計算する";
    }

    function showResults(diameter, annualOneTree, customCount) {
      renderNumber(elements.oneTreeHighlightValue, annualOneTree, " kg/年");
      renderNumber(elements.diameterTableValue, diameter);
      renderNumber(elements.oneTreeValue, annualOneTree);
      renderNumber(elements.tenTreesValue, annualOneTree * 10);

      if (customCount === null) {
        elements.customCountRow.hidden = true;
      } else {
        elements.customCountLabel.textContent = `${customCount.toLocaleString("ja-JP")}本分の年間CO₂固定量`;
        renderNumber(elements.customCountValue, annualOneTree * customCount);
        elements.customCountRow.hidden = false;
      }

      elements.resultsEmpty.hidden = true;
      elements.resultsContent.hidden = false;
    }

    function clearResults() {
      elements.resultsContent.hidden = true;
      elements.resultsEmpty.hidden = false;
      elements.customCountRow.hidden = true;
    }

    function handleCalculation(event) {
      event.preventDefault();
      showLoading(true);
      try {
        const circumferenceResult = validateCircumference(elements.circumference.value, elements.unit.value);
        const countResult = validateTreeCount(elements.treeCount.value);

        setFieldError(
          elements.circumference,
          elements.circumferenceError,
          circumferenceResult.valid ? "" : circumferenceResult.message
        );
        setFieldError(elements.treeCount, elements.treeCountError, countResult.valid ? "" : countResult.message);

        if (!circumferenceResult.valid || !countResult.valid) {
          const firstInvalid = !circumferenceResult.valid ? elements.circumference : elements.treeCount;
          firstInvalid.focus();
          return;
        }

        const diameter = calculateDiameter(circumferenceResult.centimeters);
        const annualOneTree = calculateAnnualCO2(diameter);
        showResults(diameter, annualOneTree, countResult.value);
        saveInputs();
      } finally {
        showLoading(false);
      }
    }

    elements.form.addEventListener("submit", handleCalculation);
    elements.circumference.addEventListener("input", () => {
      setFieldError(elements.circumference, elements.circumferenceError);
      saveInputs();
    });
    elements.treeCount.addEventListener("input", () => {
      setFieldError(elements.treeCount, elements.treeCountError);
      saveInputs();
    });
    elements.unit.addEventListener("change", saveInputs);

    elements.resetButton.addEventListener("click", () => {
      elements.circumference.value = "";
      elements.treeCount.value = "";
      elements.unit.value = elements.defaultUnit.value;
      setFieldError(elements.circumference, elements.circumferenceError);
      setFieldError(elements.treeCount, elements.treeCountError);
      clearResults();
      saveInputs();
      elements.circumference.focus();
    });

    elements.defaultUnit.addEventListener("change", () => {
      saveInputs();
      elements.settingsStatus.textContent = `デフォルト単位を${elements.defaultUnit.value}に保存しました．`;
    });

    elements.resetSettingsButton.addEventListener("click", () => {
      elements.defaultUnit.value = "cm";
      saveInputs();
      elements.settingsStatus.textContent = "デフォルト単位をcmに戻しました．";
      elements.defaultUnit.focus();
    });
  }

  return Object.freeze({
    MAX_CIRCUMFERENCE_CM,
    MAX_TREE_COUNT,
    STORAGE_KEY,
    convertToCentimeters,
    calculateDiameter,
    calculateAnnualCO2,
    validateCircumference,
    validateTreeCount,
    numberParts,
    sanitizeStoredState,
    readStoredState,
    writeStoredState,
    initializeUI
  });
})();

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    TreeCO2Calculator.initializeUI(document, window.localStorage);
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = TreeCO2Calculator;
}
