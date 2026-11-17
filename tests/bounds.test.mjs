// Калькулятор граничных значений: целые и дробные шаги, вырожденный и перевернутый диапазон.
import test from "node:test";
import assert from "node:assert/strict";
import { boundaries } from "../bounds/lib.js";

const vals = (input) => {
  const r = boundaries(input);
  assert.ok(r.ok, r.error);
  return r.values.map((v) => v.value);
};

test("1..100 шаг 1: две и три точки", () => {
  assert.deepEqual(vals({ min: "1", max: "100", step: "1" }), ["0", "1", "100", "101"]);
  assert.deepEqual(vals({ min: "1", max: "100", step: "1", points: 3 }), ["0", "1", "2", "99", "100", "101"]);
  const r = boundaries({ min: "1", max: "100", step: "1" });
  assert.deepEqual(r.values.map((v) => v.valid), [false, true, true, false]);
  assert.deepEqual(r.classes.map((c) => [c.example, c.valid]), [["-9", false], ["50", true], ["110", false]]);
});

test("шаг 0.01 без ошибок плавающей точки", () => {
  assert.deepEqual(vals({ min: "0.5", max: "9.5", step: "0.01" }), ["0.49", "0.5", "9.5", "9.51"]);
  assert.deepEqual(vals({ min: "0.5", max: "9.5", step: "0.01", points: 3 }), ["0.49", "0.5", "0.51", "9.49", "9.5", "9.51"]);
  assert.deepEqual(vals({ min: "0,1", max: "0,3", step: "0,1", points: 3 }), ["0", "0,1", "0,2", "0,3", "0,4"]);
});

test("пустой шаг берется по точности границ", () => {
  const r = boundaries({ min: "0.5", max: "10", step: "" });
  assert.equal(r.step, "0.1");
  assert.deepEqual(r.values.map((v) => v.value), ["0.4", "0.5", "10", "10.1"]);
});

test("min = max: одно допустимое значение", () => {
  assert.deepEqual(vals({ min: "5", max: "5", step: "1" }), ["4", "5", "6"]);
  assert.deepEqual(vals({ min: "5", max: "5", step: "1", points: 3 }), ["4", "5", "6"]);
  assert.equal(boundaries({ min: "5", max: "5", step: "1" }).classes[1].range, "ровно 5");
});

test("min > max, шаг 0 и не числа – ошибка", () => {
  assert.match(boundaries({ min: "10", max: "1", step: "1" }).error, /больше верхней/);
  assert.match(boundaries({ min: "1", max: "10", step: "0" }).error, /больше нуля/);
  assert.match(boundaries({ min: "a", max: "10" }).error, /числами/);
  assert.match(boundaries({ min: "1", max: "" }).error, /числами/);
});

test("отрицательный диапазон", () => {
  assert.deepEqual(vals({ min: "-10", max: "-1", step: "1" }), ["-11", "-10", "-1", "0"]);
  assert.deepEqual(vals({ min: "-0.5", max: "0.5", step: "0.25", points: 3 }), ["-0.75", "-0.5", "-0.25", "0.25", "0.5", "0.75"]);
});

test("максимум вне сетки шага – предупреждение", () => {
  const r = boundaries({ min: "0", max: "10", step: "3" });
  assert.equal(r.warnings.length, 1);
  assert.equal(boundaries({ min: "0", max: "9", step: "3" }).warnings.length, 0);
});
