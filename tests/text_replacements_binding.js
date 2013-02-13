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

suite('Text Replacement BInding', function() {

  test('TextReplacementsBinding', function() {
    var lastSeenValue;
    var changeCount = 0;
    var observer = {
      valueChanged: function(b) {
        assert.strictEqual(binding, b);
        changeCount++;
        lastSeenValue = b.value;
      }
    };

    var model = {first: 'First', last: 'Last'};
    var binding = new TextReplacementsBinding(model, null,
                                              'Hello {{first}} {{last}}!',
                                              observer);

    assert.strictEqual('Hello First Last!', binding.value);

    model.last = 'Fry';
    Model.notifyChanges();
    assert.strictEqual('Hello First Fry!', binding.value);
    assert.strictEqual(1, changeCount);
    assert.strictEqual('Hello First Fry!', lastSeenValue);

    model.first = 'Philip';
    Model.notifyChanges();
    assert.strictEqual('Hello Philip Fry!', binding.value);
    assert.strictEqual(2, changeCount);
    assert.strictEqual('Hello Philip Fry!', lastSeenValue);
  });

  test('TextReplacementsBindingWithDelegate', function() {
    var observer = {
      valueChanged: function(binding) {

      }
    };

    function delegate(text) {
      var re = /\w+(\.\w+)*/g;

      function replacePathWithIdent(path) {
        return path.replace(/\W/g, '_');
      }

      var paths = text.match(re);
      var args = paths.map(replacePathWithIdent);
      var expr = text.replace(re, replacePathWithIdent);
      var toTarget = new Function(args.join(','), 'return (' + expr + ')');
      return [paths, toTarget];
    }

    var model = {v: {x: 1, y: 2}};
    var binding = new TextReplacementsBinding(model, delegate,
                                              '{{v.x}} + {{v.y}} = {{v.x + v.y}}',
                                              observer);

    assert.strictEqual('1 + 2 = 3', binding.value);

    model.v.x = 4;
    Model.notifyChanges();
    assert.strictEqual('4 + 2 = 6', binding.value);

    model.v = {x: 5, y: 6};
    Model.notifyChanges();
    assert.strictEqual('5 + 6 = 11', binding.value);
  });

});