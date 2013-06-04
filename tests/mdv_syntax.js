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

suite('MDV Syntax', function() {

  var testDiv;

  function unbindAll(node) {
    node.unbindAll();
    for (var child = node.firstChild; child; child = child.nextSibling)
      unbindAll(child);
  }

  setup(function() {
    HTMLTemplateElement.syntax['MDV'] = new MDVSyntax();
    testDiv = document.body.appendChild(document.createElement('div'));
    Observer._errorThrownDuringCallback = false;
  });

  teardown(function() {
    delete HTMLTemplateElement.syntax['MDV'];
    assert.isFalse(!!Observer._errorThrownDuringCallback);
    document.body.removeChild(testDiv);
    unbindAll(testDiv);
    Platform.performMicrotaskCheckpoint();
    assert.strictEqual(2, Observer._allObserversCount);
  });

  function hasClass(node, className) {
    return node.className.split(' ').some(function(name) {
      return name === className;
    });
  }

  function assertHasClass(node, className) {
    return assert.isTrue(hasClass(node, className))
  }

  function assertLacksClass(node, className) {
    return assert.isFalse(hasClass(node, className))
  }

  function createTestHtml(s) {
    var div = document.createElement('div');
    div.innerHTML = s;
    testDiv.appendChild(div);

    HTMLTemplateElement.forAllTemplatesFrom_(div, function(template) {
      HTMLTemplateElement.decorate(template);
    });

    return div;
  }

  function recursivelySetTemplateModel(node, model) {
    HTMLTemplateElement.forAllTemplatesFrom_(node, function(template) {
      template.model = model;
    });
  }

  test('ClassName Singular', function() {
    var div = createTestHtml(
        '<template bind syntax="MDV"><div class="{{ foo: bar }}">' +
        '</div></template>');
    var model = {bar: 1};
    recursivelySetTemplateModel(div, model);
    Platform.performMicrotaskCheckpoint();

    var target = div.childNodes[1];
    assertHasClass(target, 'foo');

    model.bar = 0;
    Platform.performMicrotaskCheckpoint();
    assertLacksClass(target, 'foo');
  });

  test('ClassName Multiple', function() {
    var div = createTestHtml(
        '<template bind syntax="MDV">' +
        '<div class="{{ foo: bar; baz: bat; boo: bot.bam }}">' +
        '</div></template>');
    var model = {bar: 1, bat: 0, bot: { bam: 1 }};
    recursivelySetTemplateModel(div, model);
    Platform.performMicrotaskCheckpoint();

    var target = div.childNodes[1];
    assert.strictEqual('foo boo', target.className);
    assertHasClass(target, 'foo');
    assertLacksClass(target, 'baz');
    assertHasClass(target, 'boo');

    model.bar = 0;
    model.bat = 1;
    Platform.performMicrotaskCheckpoint();
    assert.strictEqual('baz boo', target.className);
    assertLacksClass(target, 'foo');
    assertHasClass(target, 'baz');
    assertHasClass(target, 'boo');
  });

  test('Named Scope Bind', function() {
    var div = createTestHtml(
        '<template bind syntax="MDV">' +
          '<template bind="{{ foo.bar as baz }}">' +
            '{{ id }}:{{ baz.bat }}' +
          '</template>' +
        '</template>');
    var model = { id: 'id', foo: { bar: { bat: 'boo' }}};
    recursivelySetTemplateModel(div, model);
    Platform.performMicrotaskCheckpoint();

    assert.strictEqual('id:boo', div.childNodes[2].textContent);
  });

  test('Named Scope Repeat', function() {
    var div = createTestHtml(
        '<template bind syntax="MDV">' +
          '<template repeat="{{ user in users }}">' +
            '{{ id }}:{{ user.name }}' +
          '</template>' +
        '</template>');
    var model = {
      id: 'id',
      users: [
        { name: 'Tim' },
        { name: 'Sally'}
      ]
    };
    recursivelySetTemplateModel(div, model);
    Platform.performMicrotaskCheckpoint();

    assert.strictEqual('id:Tim', div.childNodes[2].textContent);
    assert.strictEqual('id:Sally', div.childNodes[3].textContent);
  });

  test('Named Scope Deep Nesting', function() {
    var div = createTestHtml(
        '<template bind syntax="MDV">' +
          '<template repeat="{{ user in users }}">' +
            '{{ id }}:{{ user.name }}' +
            '<template repeat="{{ employee in user.employees }}">' +
              '{{ id }}:{{ user.name }}:{{ employee.name }}' +
            '</template>' +
          '</template>' +
        '</template>');
    var model = {
      id: 'id',
      users: [
        { name: 'Tim', employees: [{ name: 'Bob'}, { name: 'Sam'}]},
        { name: 'Sally', employees: [{ name: 'Steve' }]}
      ]
    };
    recursivelySetTemplateModel(div, model);
    Platform.performMicrotaskCheckpoint();

    assert.strictEqual('id:Tim', div.childNodes[2].textContent);
    assert.strictEqual('id:Tim:Bob', div.childNodes[4].textContent);
    assert.strictEqual('id:Tim:Sam', div.childNodes[5].textContent);

    assert.strictEqual('id:Sally', div.childNodes[6].textContent);
    assert.strictEqual('id:Sally:Steve', div.childNodes[8].textContent);
  });

  test('Named Scope Unnamed resets', function() {
    var div = createTestHtml(
        '<template bind syntax="MDV">' +
          '<template bind="{{ foo as bar }}">' +
            '{{ bar.id }}' +
            '<template bind="{{ bar.bat }}">' +
              '{{ boo }}:{{ bar.id }}' +
            '</template>' +
          '</template>' +
        '</template>');
    var model = {
      foo: {
        id: 2,
        bat: {
          boo: 'bot'
        }
      },
    };
    recursivelySetTemplateModel(div, model);
    Platform.performMicrotaskCheckpoint();

    assert.strictEqual('2', div.childNodes[2].textContent);
    assert.strictEqual('bot:', div.childNodes[4].textContent);
  });
});
