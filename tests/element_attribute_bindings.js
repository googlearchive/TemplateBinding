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

suite('Element Attribute Bindings', function() {

  test('ElementAttributeBindings', function() {
    var bindings = new ElementAttributeBindings();
    var element = document.createElement('div');
    var model = element.model = {a: 1, b: 2};
    bindings.addBinding(element, 'hidden', '{{a}}');
    bindings.addBinding(element, 'id', '{{b}}');

    assert.equal('1', element.getAttribute('hidden'));
    assert.equal('2', element.id);

    model.a = null;
    Model.notifyChanges();
    assert.isFalse(element.hasAttribute('hidden'));

    element.model = {a: false, b: 'x'};
    bindings.modelChanged(element.model);
    Model.notifyChanges();
    assert.equal('false', element.getAttribute('hidden'));
    assert.equal('x', element.id);

    function delegate(text) {
      function toTarget(value) {
        return value ? value : null;
      }
      return [[text], toTarget];
    }
    element.modelDelegate = delegate;
    bindings.modelDelegateChanged(element.modelDelegate);
    assert.isFalse(element.hasAttribute('hidden'));
    assert.equal('x', element.id);
  });
});