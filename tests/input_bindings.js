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

suite('Input Bindings', function() {

  function dispatchEvent(type, target) {
    var event = document.createEvent('HTMLEvents');
    event.initEvent(type, true, false);
    target.dispatchEvent(event);
  }

  test('Text Input', function() {
    var input = document.createElement('input');
    input.model = {x: 42};
    input.addValueBinding('x');
    Model.notifyChanges();
    assert.strictEqual('42', input.value);

    input.model.x = 'Hi';
    assert.strictEqual('42', input.value);
    Model.notifyChanges();
    assert.strictEqual('Hi', input.value);

    input.value = 'changed';
    dispatchEvent('input', input);
    assert.strictEqual('changed', input.model.x);

    input.removeValueBinding();

    input.value = 'changed again';
    dispatchEvent('input', input);
    assert.strictEqual('changed', input.model.x);
  });

  test('Radio Input', function() {
    var input = document.createElement('input');
    input.type = 'radio';
    input.model = {x: true};
    input.addCheckedBinding('x');
    Model.notifyChanges();
    assert.isTrue(input.checked);

    input.model.x = false;
    assert.isTrue(input.checked);
    Model.notifyChanges();
    assert.isFalse(input.checked);

    input.checked = true;
    dispatchEvent('change', input);
    assert.isTrue(input.model.x);

    input.removeCheckedBinding();

    input.checked = false;
    dispatchEvent('change', input);
    assert.isTrue(input.model.x);
  });

  test('Checkbox Input', function() {
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.model = {x: true};
    input.addCheckedBinding('x');
    Model.notifyChanges();
    assert.isTrue(input.checked);

    input.model.x = false;
    assert.isTrue(input.checked);
    Model.notifyChanges();
    assert.isFalse(input.checked);

    input.checked = true;
    dispatchEvent('click', input);
    assert.isTrue(input.model.x);
    Model.notifyChanges();

    input.checked = false;
    dispatchEvent('click', input);
    assert.isFalse(input.model.x);
  });

});