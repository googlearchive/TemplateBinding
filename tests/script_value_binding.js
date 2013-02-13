// Copyright 2013 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
suite('Model', function() {

  test('ScriptValueBindingA', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(v) {
        changeCount++;
        lastSeenValue = v.value;
      }
    };

    var model = {a: 42};
    var binding = new ScriptValueBinding(model, 'a', observer);

    assert.strictEqual(42, binding.value);
    assert.strictEqual(0, changeCount);
    assert.isUndefined(lastSeenValue);

    model.a = 'Changed';
    Model.notifyChanges();

    assert.strictEqual('Changed', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('Changed', lastSeenValue);
  });

  test('ScriptValueBindingAB', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(v) {
        changeCount++;
        lastSeenValue = v.value;
      }
    };

    var model = {a: {b: 42}};
    var binding = new ScriptValueBinding(model, 'a.b', observer);

    assert.strictEqual(42, binding.value);
    assert.strictEqual(0, changeCount);
    assert.isUndefined(lastSeenValue);

    model.a.b = 'Changed';
    Model.notifyChanges();

    assert.strictEqual('Changed', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('Changed', lastSeenValue);

    model.a = {b: true};
    Model.notifyChanges();

    assert.strictEqual(true, binding.value);
    assert.strictEqual(2, changeCount);
    assert.strictEqual(true, lastSeenValue);
  });

  test('DelegatedValueBinding', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(v) {
        changeCount++;
        lastSeenValue = v.value;
      }
    };

    function delegate(text) {
      assert.strictEqual(bindingText, text);
      function toTarget(a, b) {
        return a + b;
      }
      return [['a', 'b'], toTarget];
    }

    var model = {a: 'a', b: 'b'};
    var bindingText = 'binding text';
    var ONE_WAY = DelegatedValueBinding.Type.ONE_WAY;

    var binding = new DelegatedValueBinding(model, delegate, bindingText,
                                            ONE_WAY, observer);

    assert.strictEqual('ab', binding.value);

    model.a = 1;
    Model.notifyChanges();
    assert.strictEqual('1b', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('1b', lastSeenValue);

    model.b = 2;
    Model.notifyChanges();
    assert.strictEqual(3, binding.value);
    assert.strictEqual(2, changeCount);
    assert.strictEqual(3, lastSeenValue);
  });

  test('DelegatedValueBindingDeep', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(v) {
        changeCount++;
        lastSeenValue = v.value;
      }
    };

    function delegate(text) {
      assert.strictEqual(bindingText, text);
      function toTarget(ab, cd) {
        return ab + cd;
      }
      return [['a.b', 'c.d'], toTarget];
    }

    var model = {
      a: {b: 'ab'},
      c: {d: 'cd'}
    };
    var bindingText = 'binding text';
    var ONE_WAY = DelegatedValueBinding.Type.ONE_WAY;

    var binding = new DelegatedValueBinding(model, delegate, bindingText,
                                            ONE_WAY, observer);

    assert.strictEqual('abcd', binding.value);

    model.a.b = 1;
    Model.notifyChanges();
    assert.strictEqual('1cd', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('1cd', lastSeenValue);

    model.c.d = 2;
    Model.notifyChanges();
    assert.strictEqual(3, binding.value);
    assert.strictEqual(2, changeCount);
    assert.strictEqual(3, lastSeenValue);

    model.a = {b: 3};
    Model.notifyChanges();
    assert.strictEqual(5, binding.value);
    assert.strictEqual(3, changeCount);
    assert.strictEqual(5, lastSeenValue);

    model.a = {b: 'hello'};
    model.c = {d: ' world'};
    Model.notifyChanges();
    assert.strictEqual('hello world', binding.value);
    assert.strictEqual(5, changeCount);
    assert.strictEqual('hello world', lastSeenValue);
  });

  test('DelegatedValueBindingTwoWay', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(v) {
        changeCount++;
        lastSeenValue = v.value;
      }
    };

    function delegate(text) {
      assert.strictEqual(bindingText, text);
      function toTarget(a, b) {
        return a + b;
      }
      function toSource(value) {
        return value + 1;
      }
      return [['a', 'b'], toTarget, toSource];
    }

    var model = {a: 'a', b: 'b'};
    var bindingText = 'binding text';
    var TWO_WAY = DelegatedValueBinding.Type.TWO_WAY;

    var binding = new DelegatedValueBinding(model, delegate, bindingText,
                                            TWO_WAY, observer);

    assert.strictEqual('ab', binding.value);

    model.a = 1;
    Model.notifyChanges();
    assert.strictEqual('1b', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('1b', lastSeenValue);

    model.b = 2;
    Model.notifyChanges();
    assert.strictEqual(3, binding.value);
    assert.strictEqual(2, changeCount);
    assert.strictEqual(3, lastSeenValue);

    binding.value = 3;
    assert.strictEqual(4, model.a);
    Model.notifyChanges();
    assert.strictEqual(6, binding.value);
    assert.strictEqual(3, changeCount);
    assert.strictEqual(6, lastSeenValue);
  });

  test('DelegatedValueBindingTwoWayDeep', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(v) {
        changeCount++;
        lastSeenValue = v.value;
      }
    };

    function delegate(text) {
      assert.strictEqual(bindingText, text);
      function toTarget(ab, cd) {
        return ab + cd;
      }
      function toSource(v) {
        return v + 1;
      }
      return [['a.b', 'c.d'], toTarget, toSource];
    }

    var model = {
      a: {b: 'ab'},
      c: {d: 'cd'}
    };
    var bindingText = 'binding text';
    var TWO_WAY = DelegatedValueBinding.Type.TWO_WAY;

    var binding = new DelegatedValueBinding(model, delegate, bindingText,
                                            TWO_WAY, observer);

    assert.strictEqual('abcd', binding.value);

    model.a.b = 1;
    Model.notifyChanges();
    assert.strictEqual('1cd', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('1cd', lastSeenValue);

    model.c.d = 2;
    Model.notifyChanges();
    assert.strictEqual(3, binding.value);
    assert.strictEqual(2, changeCount);
    assert.strictEqual(3, lastSeenValue);

    model.a = {b: 3};
    Model.notifyChanges();
    assert.strictEqual(5, binding.value);
    assert.strictEqual(3, changeCount);
    assert.strictEqual(5, lastSeenValue);

    model.a = {b: 'hello'};
    model.c = {d: ' world'};
    Model.notifyChanges();
    assert.strictEqual('hello world', binding.value);
    assert.strictEqual(5, changeCount);
    assert.strictEqual('hello world', lastSeenValue);

    binding.value = 3;
    assert.strictEqual(4, model.a.b);
    Model.notifyChanges();
    assert.strictEqual('4 world', binding.value);
    assert.strictEqual(6, changeCount);
    assert.strictEqual('4 world', lastSeenValue);
  });

});