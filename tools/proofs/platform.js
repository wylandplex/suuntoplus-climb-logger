'use strict';

// Strict, reusable SuuntoPlus platform double. Production behavior is always
// loaded from the repository at runtime; this file contains only the watch
// services and human-facing lifecycle driver around it.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
}

function snapshot(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function applySeed(base, seed) {
  var out = snapshot(base);
  if (!seed) return out;
  Object.keys(seed).forEach(function (key) { out[key] = snapshot(seed[key]); });
  return out;
}

function matchesRule(rule, call) {
  if (rule.op && rule.op !== call.op) return false;
  if (rule.key !== undefined && rule.key !== call.key) return false;
  if (rule.callIndex !== undefined && rule.callIndex !== call.index) return false;
  if (rule.opIndex !== undefined && rule.opIndex !== call.opIndex) return false;
  if (rule.predicate && !rule.predicate(call)) return false;
  return true;
}

function StrictLocalStorage(options) {
  options = options || {};
  this.policy = options.policy || 'reject-key';
  if (['reject-key', 'poison-store', 'permissive'].indexOf(this.policy) < 0) {
    throw new Error('unknown localStorage policy: ' + this.policy);
  }

  // The schema and initial store are intentionally read from data.json now,
  // rather than captured in a handwritten fixture. END-FOLD: the shipped seed no longer
  // carries a v3 skeleton (a v3 container may only ever come from a real fold) — the
  // default TEST store still models a canonical post-fold user, so synthesize the skeleton
  // in exactly the shape ext16/ext11 write it.
  this.defaults = readJson('data.json');
  if (!this.defaults.climbProjStats) {
    var skel = { v: 3, g: 0, u: 1 }, gi, ps;
    for (gi = 0; gi < 10; gi++) { skel['s' + gi] = [0, 0, 0, 0, 0, -1]; ps = {}; ps[20] = ''; skel['p' + gi] = ps; }
    this.defaults.climbProjStats = skel;
  }
  this.allowlist = new Set(Object.keys(this.defaults));
  this.store = applySeed(this.defaults, options.seed);
  this.calls = [];
  this.counts = {};
  this.failures = [];
  this.poisoned = false;
  (options.failures || []).forEach(this.injectFailure.bind(this));
}

StrictLocalStorage.prototype.injectFailure = function (rule) {
  var copy = Object.assign({}, rule);
  copy.remaining = rule.times === undefined ? 1 : rule.times;
  this.failures.push(copy);
  return copy;
};

StrictLocalStorage.prototype.clearFailures = function () {
  this.failures.length = 0;
};

StrictLocalStorage.prototype.resetPoison = function () {
  this.poisoned = false;
};

StrictLocalStorage.prototype._begin = function (op, key, value) {
  this.counts[op] = (this.counts[op] || 0) + 1;
  var call = {
    index: this.calls.length + 1,
    opIndex: this.counts[op],
    op: op,
    key: key,
    value: snapshot(value),
    declared: this.allowlist.has(key),
    outcome: 'pending'
  };
  this.calls.push(call);

  if (this.poisoned) {
    call.outcome = 'poisoned';
    throw new Error('localStorage is poisoned');
  }

  if (!call.declared && this.policy === 'reject-key') {
    call.outcome = 'rejected-key';
    return { call: call, rejected: true };
  }
  if (!call.declared && this.policy === 'poison-store') {
    this.poisoned = true;
    call.outcome = 'poisoned-by-undeclared-key';
    throw new Error('undeclared localStorage key poisoned store: ' + key);
  }

  for (var i = 0; i < this.failures.length; i++) {
    var rule = this.failures[i];
    if (rule.remaining !== 0 && matchesRule(rule, call)) {
      if (rule.remaining !== Infinity) rule.remaining--;
      call.outcome = 'injected-throw';
      throw new Error(rule.message || ('injected ' + op + ' failure for ' + key));
    }
  }
  return { call: call, rejected: false };
};

StrictLocalStorage.prototype.getObject = function (key) {
  var started = this._begin('getObject', key, this.store[key]);
  if (started.rejected) return undefined;
  started.call.outcome = 'returned';
  return snapshot(this.store[key]);
};

StrictLocalStorage.prototype.setObject = function (key, value) {
  var started = this._begin('setObject', key, value);
  if (started.rejected) return;
  this.store[key] = snapshot(value);
  started.call.outcome = 'written';
};

StrictLocalStorage.prototype.getItem = function (key) {
  var started = this._begin('getItem', key, this.store[key]);
  if (started.rejected) return undefined;
  started.call.outcome = 'returned';
  return this.store[key] === undefined ? undefined : String(this.store[key]);
};

StrictLocalStorage.prototype.setItem = function (key, value) {
  var started = this._begin('setItem', key, value);
  if (started.rejected) return;
  this.store[key] = String(value);
  started.call.outcome = 'written';
};

StrictLocalStorage.prototype.peek = function (key) {
  return snapshot(this.store[key]);
};

StrictLocalStorage.prototype.materializedKeys = function () {
  return Object.keys(this.store).sort();
};

function EvalController() {
  this.calls = [];
  this.failures = [];
}

EvalController.prototype.injectFailure = function (rule) {
  var copy = Object.assign({}, rule);
  copy.remaining = rule.times === undefined ? 1 : rule.times;
  this.failures.push(copy);
  return copy;
};

EvalController.prototype.clearFailures = function () {
  this.failures.length = 0;
};

EvalController.prototype._shouldFail = function (call) {
  for (var i = 0; i < this.failures.length; i++) {
    var rule = this.failures[i];
    if (rule.remaining === 0) continue;
    if (rule.extension !== undefined && String(rule.extension) !== call.extension) continue;
    if (rule.path !== undefined && rule.path !== call.path) continue;
    if (rule.callIndex !== undefined && rule.callIndex !== call.index) continue;
    if (rule.predicate && !rule.predicate(call)) continue;
    if (rule.remaining !== Infinity) rule.remaining--;
    return rule;
  }
  return null;
};

function buildBags(manifest, inputValues) {
  var input = {};
  var output = {};
  (manifest.in || []).forEach(function (entry, index) {
    var value = inputValues && inputValues[entry.name] !== undefined ? inputValues[entry.name] : 0;
    input[entry.name] = value;
    input[index] = value;
  });
  (manifest.out || []).forEach(function (entry, index) {
    output[entry.name] = undefined;
    output[index + (manifest.in || []).length] = undefined;
  });
  return { input: input, output: output };
}

var STATE_EXPORT = [
  "this.__proofApi={getUserInterface:getUserInterface,onLoad:onLoad,evaluate:evaluate,onEvent:onEvent,onLap:onLap,onExercisePause:onExercisePause,onExerciseContinue:onExerciseContinue,onExerciseEnd:onExerciseEnd,getSummaryOutputs:getSummaryOutputs};",
  "this.__proofState=function(){return {state:state,currentTemplate:currentTemplate,gradeSystem:gradeSystem,currentGrade:currentGrade,routeNumber:routeNumber,routesA:routesA.slice(),routesB:routesB.slice(),lastResult:lastResult,lastDuration:lastDuration,lastGradeIdx:lastGradeIdx,frDirty:frDirty,extLapPending:extLapPending,isPaused:isPaused,finalized:finalized,curAsc:curAsc,startAsc:startAsc,lastHeight:lastHeight,sessionH:sessionH,climbMode:climbMode,lastClimbMode:lastClimbMode,pStep:pStep,projGradeIdx:projGradeIdx.slice(),projSlot:projSlot.slice(),pendF12:pendF12,dfTries:dfTries,stOk:stOk,slTries:slTries,exFail:exFail,psDirty:psDirty,slotsDirty:slotsDirty,sysDirty:sysDirty,skipP:skipP,pendSlots:pendSlots,pendE:pendE,pendV:pendV,migPend:migPend,migOK:migOK,slotTouched:slotTouched,f3:!!f3,f10:!!f10,fE:!!fE,fP:!!fP,acc:acc?acc.slice():null,sumStale:sumStale,summary:lastSummaryCache};};"
].join('\n');

function AppDriver(platform) {
  this.platform = platform;
  this.manifest = platform.manifest;
  var bags = buildBags(this.manifest, { H: 1.5, Asc: 0 });
  this.input = bags.input;
  this.output = bags.output;
  this.dom = {};
  this.uiCalls = [];
  this.loaded = false;

  var driver = this;
  var sandbox = {
    localStorage: platform.storage,
    setText: function (selector, text) {
      driver.dom[selector] = String(text);
      driver.uiCalls.push({ op: 'setText', selector: selector, value: String(text) });
    },
    setStyle: function (selector, prop, value) {
      driver.uiCalls.push({ op: 'setStyle', selector: selector, prop: prop, value: value });
    },
    unload: function (name) {
      driver.uiCalls.push({ op: 'unload', value: name });
    }
  };
  vm.createContext(sandbox);
  sandbox.evalFile = function (requestedPath) {
    var match = /ext(\d+)\.js$/.exec(requestedPath);
    if (!match) throw new Error('unsupported evalFile path: ' + requestedPath);
    var extension = match[1];
    var realPath = path.join(ROOT, 'ext' + extension + '.js');
    var call = {
      index: platform.evals.calls.length + 1,
      extension: extension,
      path: realPath,
      requestedPath: requestedPath,
      outcome: 'pending'
    };
    platform.evals.calls.push(call);
    var failure = platform.evals._shouldFail(call);
    if (failure) {
      call.outcome = 'injected-throw';
      throw new Error(failure.message || ('injected evalFile failure for ext' + extension));
    }
    var source = fs.readFileSync(realPath, 'utf8');
    var fn = vm.runInContext('(' + source + '\n)', sandbox, { filename: realPath });
    call.outcome = 'parsed-real-source';
    return fn;
  };

  var mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  vm.runInContext(mainSource + '\n' + STATE_EXPORT, sandbox, { filename: path.join(ROOT, 'main.js') });
  this.sandbox = sandbox;
  this.api = sandbox.__proofApi;
}

AppDriver.prototype._setInput = function (values) {
  var inputDefs = this.manifest.in || [];
  for (var i = 0; i < inputDefs.length; i++) {
    var name = inputDefs[i].name;
    if (values && values[name] !== undefined) {
      this.input[name] = values[name];
      this.input[i] = values[name];
    }
  }
};

AppDriver.prototype.load = function () {
  this.api.onLoad(this.input, this.output);
  this.loaded = true;
  return this.state();
};

AppDriver.prototype.state = function () {
  return snapshot(this.sandbox.__proofState());
};

AppDriver.prototype.readOutput = function (name) {
  var defs = this.manifest.out || [];
  for (var i = 0; i < defs.length; i++) {
    if (defs[i].name === name) {
      var numeric = this.output[i + (this.manifest.in || []).length];
      return numeric !== undefined ? numeric : this.output[name];
    }
  }
  return this.output[name];
};

AppDriver.prototype.evaluate = function (values) {
  this._setInput(values || {});
  this.api.evaluate(this.input, this.output);
  var st = this.state();
  return this.state();
};

AppDriver.prototype.ticks = function (count, values) {
  for (var i = 0; i < count; i++) this.evaluate(values);
  return this.state();
};

AppDriver.prototype.press = function (eventId) {
  this.api.onEvent(this.input, this.output, eventId);
  return this.state();
};

AppDriver.prototype.lap = function () {
  this.api.onLap(this.input, this.output);
  return this.state();
};

AppDriver.prototype.pause = function () {
  this.api.onExercisePause(this.input, this.output);
  return this.state();
};

AppDriver.prototype.continue = function () {
  this.api.onExerciseContinue(this.input, this.output);
  return this.state();
};

AppDriver.prototype.end = function () {
  this.api.onExerciseEnd(this.input, this.output);
  return this.state();
};

AppDriver.prototype.summary = function () {
  return snapshot(this.api.getSummaryOutputs(this.input, this.output));
};

AppDriver.prototype.warm = function (count) {
  return this.ticks(count === undefined ? 6 : count, { H: 1.5 });
};

AppDriver.prototype.pickGradeSystem = function (target) {
  var st = this.state();
  if (st.state !== 4) throw new Error('grade system can only be picked in SETUP; state=' + st.state);
  var steps = (target - st.gradeSystem + 10) % 10;
  for (var i = 0; i < steps; i++) this.press(1);
  this.press(6);
  for (i = 0; i < 8 && this.state().pendSlots; i++) this.evaluate({ H: 1.5 });
  this.warm(3);
  return this.state();
};

AppDriver.prototype.toReady = function () {
  var st = this.state();
  if (st.isPaused) { this.continue(); st = this.state(); }
  if (st.state === 4) this.press(6);
  else if (st.state === 2) this.press(6);
  else if (st.state === 5 || st.state === 6) this.press(5);
  st = this.state();
  if (st.state !== 0) throw new Error('cannot reach READY from state=' + st.state);
  return st;
};

AppDriver.prototype.setFreeGrade = function (target) {
  var st = this.toReady();
  if (st.climbMode !== 0) this.press(4);
  st = this.state();
  var guard = 0;
  while (st.currentGrade !== target && guard++ < 200) { this.press(1); st = this.state(); }
  if (st.currentGrade !== target) throw new Error('could not select grade ' + target);
  return st;
};

AppDriver.prototype.selectProject = function (slot) {
  var st = this.toReady();
  if (st.climbMode === 0) this.press(4);
  st = this.state();
  var guard = 0;
  while (st.climbMode !== slot && guard++ < 10) { this.press(1); st = this.state(); }
  if (st.climbMode !== slot) throw new Error('could not select project slot ' + slot);
  return st;
};

AppDriver.prototype.start = function () {
  var st = this.toReady();
  this.press(6);
  st = this.state();
  if (st.state !== 1) throw new Error('START was refused');
  return st;
};

AppDriver.prototype.climb = function (options) {
  options = options || {};
  var send = options.send === undefined ? true : !!options.send;
  var seconds = options.seconds === undefined ? 1 : options.seconds;
  var height = options.height === undefined ? 0 : options.height;
  var hr = options.hr === undefined ? 1.5 : options.hr;
  var st = this.state();
  if (st.state === 2) this.press(6);
  if (this.state().state === 0) this.start();
  st = this.state();
  if (st.state !== 1) throw new Error('climb requires CLIMB state; state=' + st.state);
  var base = st.startAsc;
  for (var i = 0; i < seconds; i++) {
    this.evaluate({ H: hr, Asc: base + height * (i + 1) / Math.max(1, seconds) });
  }
  this.press(send ? 6 : 5);
  this.evaluate({ H: hr, Asc: base + height });
  return this.state();
};

AppDriver.prototype.saveAsProject = function () {
  if (this.state().state !== 2) throw new Error('save-as-project requires BREAK');
  this.press(4);
  return this.state();
};

AppDriver.prototype.openEdit = function () {
  this.toReady();
  for (var i = 0; i < 5 && !this.state().fP; i++) this.evaluate({ H: 1.5 });
  this.press(5);
  if (this.state().pendE) this.evaluate({ H: 1.5 });
  return this.state();
};

AppDriver.prototype.editCycleResult = function () {
  if (this.state().state !== 5) throw new Error('result edit requires EDIT');
  this.press(4);
  return this.state();
};

function createPlatform(options) {
  options = options || {};
  var platform = {
    root: ROOT,
    manifest: readJson('manifest.json'),
    storage: new StrictLocalStorage(options),
    evals: new EvalController()
  };
  (options.evalFailures || []).forEach(platform.evals.injectFailure.bind(platform.evals));
  platform.createApp = function () { return new AppDriver(platform); };
  return platform;
}

module.exports = {
  ROOT: ROOT,
  StrictLocalStorage: StrictLocalStorage,
  createPlatform: createPlatform,
  snapshot: snapshot
};
