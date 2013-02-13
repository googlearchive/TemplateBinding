// Copyright 2013 Google Inc.

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

suite('Element Bindings', function() {

  // Note: DOMNodeInserted/Removed only fire in webkit if the node is rooted in
  // document. This is just an attachment point so that tests will pass in
  // webkit.
  var testContainerDiv;

  setup(function() {
    testContainerDiv = document.body.appendChild(document.createElement('div'));
  });

  teardown(function() {
    document.body.removeChild(testContainerDiv);
  });

  function dispatchEvent(type, target) {
    var event = document.createEvent('HTMLEvents');
    event.initEvent(type, true, false);
    target.dispatchEvent(event);
    Model.notifyChanges();
  }

  test('Model', function() {
    var d = document.createElement('div');
    d.model = 'hello world';
    assert.strictEqual('hello world', d.model);

    var d2 = d.appendChild(document.createElement('div'));
    assert.strictEqual('hello world', d2.model);
  });

  test('ModelCleared', function() {
    var parent = document.createElement('div');
    var child = parent.appendChild(document.createElement('div'));

    parent.model = 'a';
    child.model = 'b';
    Model.notifyChanges();
    assert.strictEqual('b', child.model);

    var count = 0;

    Model.observePath(child, 'model', function(val, oldVal) {
      count++;
      assert.strictEqual('b', oldVal);
    });

    child.model = undefined;
    Model.notifyChanges();
    assert.strictEqual('a', child.model);

  // TODO(rafaelw): Decide if .model property should be observable
  // https://github.com/toolkitchen/mdv/issues/10
  //  assert.strictEqual(1, count);
  });

  test('ModelDelegateInheritance', function() {
    var a = {}, b = {};
    var div = document.createElement('div');
    assert.isUndefined(div.modelDelegate);
    var child = div.appendChild(document.createTextNode('Hello MDV'));
    assert.isUndefined(child.modelDelegate);
    div.modelDelegate = a;
    assert.strictEqual(a, div.modelDelegate);
    assert.strictEqual(a, child.modelDelegate);
    child.modelDelegate = b;
    assert.strictEqual(b, child.modelDelegate);
    child.modelDelegate = null;
    assert.isNull(child.modelDelegate);
    child.modelDelegate = undefined;
    assert.strictEqual(a, child.modelDelegate);
  });

  test('Text', function() {
    var text = document.createTextNode('hi');
    var model = text.model = {a: 1, b: 2};
    text.addBinding('{{a}} and {{b}}');
    assert.strictEqual('1 and 2', text.data);

    model.a = 3;
    Model.notifyChanges();
    assert.strictEqual('3 and 2', text.data);

    text.model = {a: 4, b: 5};
    Model.notifyChanges();
    assert.strictEqual('4 and 5', text.data);
  });

  test('TextInherited', function() {
    var element = document.createElement('div');
    var text = element.appendChild(document.createTextNode('hi'));
    var model = element.model = {a: 1, b: 2};
    text.addBinding('{{a}} and {{b}}');
    assert.strictEqual('1 and 2', text.data);

    model.a = 3;
    Model.notifyChanges();
    assert.strictEqual('3 and 2', text.data);

    element.model = {a: 4, b: 5};
    Model.notifyChanges();
    assert.strictEqual('4 and 5', text.data);

    text.model = {a: 6, b: 7};
    Model.notifyChanges();
    assert.strictEqual('6 and 7', text.data);

    text.model = undefined;
    Model.notifyChanges();
    assert.strictEqual('4 and 5', text.data);
  });

  test('TextBindingText', function() {
    var text = document.createTextNode('hi');
    var model = text.model = {a: 1, b: 2};
    assert.isNull(text.bindingText);
    var bindingText = '{{a}} and {{b}}';
    text.addBinding(bindingText);
    assert.strictEqual(bindingText, text.bindingText);
    assert.strictEqual('1 and 2', text.data);
    assert.strictEqual(bindingText, text.bindingText);
    text.removeBinding();
    assert.isNull(text.bindingText);
  });

  test('Attributes', function() {
    var element = document.createElement('div');
    var model = element.model = {a: 1, b: 2};
    element.addBinding('hidden', '{{a}}');
    element.addBinding('id', '{{b}}');

    assert.strictEqual('1', element.getAttribute('hidden'));
    assert.strictEqual('2', element.id);

    model.a = null;
    Model.notifyChanges();
    assert.isFalse(element.hasAttribute('hidden'));

    element.model = {a: false, b: 'x'};
    Model.notifyChanges();
    assert.strictEqual('false', element.getAttribute('hidden'));
    assert.strictEqual('x', element.id);

    function delegate(text) {
      function toTarget(value) {
        return value ? value : null;
      }
      return [[text], toTarget];
    }
    element.modelDelegate = delegate;
    Model.notifyChanges();
    assert.isFalse(element.hasAttribute('hidden'));
    assert.strictEqual('x', element.id);
  });

  test('AttributesInherited', function() {
    var parent = document.createElement('div');
    var element = parent.appendChild(document.createElement('div'));
    var model = parent.model = {a: 1, b: 2};
    element.addBinding('hidden', '{{a}}');
    element.addBinding('id', '{{b}}');

    assert.strictEqual('1', element.getAttribute('hidden'));
    assert.strictEqual('2', element.id);

    model.a = null;
    Model.notifyChanges();
    assert.isFalse(element.hasAttribute('hidden'));

    parent.model = {a: false, b: 'x'};
    Model.notifyChanges();
    assert.strictEqual('false', element.getAttribute('hidden'));
    assert.strictEqual('x', element.id);

    function delegate(text) {
      function toTarget(value) {
        return value ? value : null;
      }
      return [[text], toTarget];
    }
    parent.modelDelegate = delegate;
    Model.notifyChanges();
    assert.isFalse(element.hasAttribute('hidden'));
    assert.strictEqual('x', element.id);
  });

  test('AttributesBindingText', function() {
    var element = document.createElement('div');
    var model = element.model = {a: 1};
    var bindingText = '{{a}}';
    element.addBinding('hidden', bindingText);

    assert.strictEqual('1', element.getAttribute('hidden'));

    var attr = element.getAttributeNode('hidden');
    assert.strictEqual(bindingText, attr.bindingText);

    model.a = null;
    Model.notifyChanges();
    assert.isFalse(element.hasAttribute('hidden'));
    assert.isNull(attr.bindingText);
  });

  test('SimpleBinding', function() {
    var el = document.createElement('div');
    el.model = {a: '1'};
    el.addBinding('foo', '{{a}}');
    Model.notifyChanges();
    assert.strictEqual('1', el.getAttribute('foo'));

    el.model.a = '2';
    Model.notifyChanges();
    assert.strictEqual('2', el.getAttribute('foo'));

    el.model.a = 232.2;
    Model.notifyChanges();
    assert.strictEqual('232.2', el.getAttribute('foo'));

    el.model.a = 232;
    Model.notifyChanges();
    assert.strictEqual('232', el.getAttribute('foo'));

    el.model.a = null;
    Model.notifyChanges();
    assert.strictEqual(null, el.getAttribute('foo'));

    el.model.a = undefined;
    Model.notifyChanges();
    assert.strictEqual('', el.getAttribute('foo'));
  });

  test('SimpleBindingWithDashes', function() {
    var el = document.createElement('div');
    el.model = {a: '1'};
    el.addBinding('foo-bar', '{{a}}');
    Model.notifyChanges();
    assert.strictEqual('1', el.getAttribute('foo-bar'));

    el.model.a = '2';
    Model.notifyChanges();
    assert.strictEqual('2', el.getAttribute('foo-bar'));
  });

  test('SimpleBindingWithComment', function() {
    var el = document.createElement('div');
    el.innerHTML = '<!-- Comment -->';
    el.model = {a: '1'};
    el.addBinding('foo-bar', '{{a}}');
    Model.notifyChanges();
    assert.strictEqual('1', el.getAttribute('foo-bar'));

    el.model.a = '2';
    Model.notifyChanges();
    assert.strictEqual('2', el.getAttribute('foo-bar'));
  });

  test('SimpleBindingChangeModel', function() {
    var el = document.createElement('div');
    el.addBinding('foo', '{{a}}');
    el.model = {a: '1'};
    Model.notifyChanges();
    assert.strictEqual('1', el.getAttribute('foo'));
  });

  test('SimpleBindingChangeAncestorModel', function() {
    var d1 = document.createElement('div');
    var d2 = d1.appendChild(document.createElement('div'));
    var d3 = d2.appendChild(document.createElement('div'));
    d3.addBinding('foo', '{{a}}');

    d1.model = {a: 1};
    Model.notifyChanges();
    assert.strictEqual('1', d3.getAttribute('foo'));

    d1.model = {a: 2};
    Model.notifyChanges();
    assert.strictEqual('2', d3.getAttribute('foo'));

    d2.model = {a: 3};
    Model.notifyChanges();
    assert.strictEqual('3', d3.getAttribute('foo'));

    d3.model = {a: 4};
    Model.notifyChanges();
    assert.strictEqual('4', d3.getAttribute('foo'));

    d2.model = {a: 5};
    Model.notifyChanges();
    assert.strictEqual('4', d3.getAttribute('foo'));

    d3.model = undefined;
    Model.notifyChanges();
    assert.strictEqual('5', d3.getAttribute('foo'));

    d2.model = undefined;
    Model.notifyChanges();
    assert.strictEqual('2', d3.getAttribute('foo'));
  });

  test('PlaceHolderBindingText', function() {
    var m = {
      adj: 'cruel',
      noun: 'world'
    };

    var el = document.createElement('div');
    el.textContent = 'dummy';
    el.firstChild.addBinding('Hello {{ adj }} {{noun}}!');
    el.model = m;

    Model.notifyChanges();
    assert.strictEqual('Hello cruel world!', el.textContent);

    el.model.adj = 'happy';
    Model.notifyChanges();
    assert.strictEqual('Hello happy world!', el.textContent);

    el.model = {
      adj: 'sunny',
      noun: 'day'
    };
    Model.notifyChanges();
    assert.strictEqual('Hello sunny day!', el.textContent);
  });

  test('PlaceHolderBindingText2', function() {
    var m = {
      adj: 'cruel',
      noun: 'world'
    };

    var el = document.createElement('div');
    el.textContent = 'dummy';
    el.firstChild.addBinding('Hello {{ adj }} {{noun}}!');
    el.model = m;

    Model.notifyChanges();
    assert.strictEqual('Hello cruel world!', el.textContent);

    el.model.adj = 'happy';
    Model.notifyChanges();
    assert.strictEqual('Hello happy world!', el.textContent);

    el.model = {
      adj: 'sunny',
      noun: 'day'
    };
    Model.notifyChanges();
    assert.strictEqual('Hello sunny day!', el.textContent);
  });

  test('PlaceHolderBindingTextInline', function() {
    var m = {
      adj: 'cruel',
      noun: 'world'
    };

    var el = document.createElement('div');
    el.textContent = 'dummy';
    el.firstChild.addBinding('Hello {{ adj }} {{noun}}!');
    el.model = m;

    Model.notifyChanges();
    assert.strictEqual('Hello cruel world!', el.textContent);

    el.model.adj = 'happy';
    Model.notifyChanges();
    assert.strictEqual('Hello happy world!', el.textContent);

    el.model = {
      adj: 'sunny',
      noun: 'day'
    };
    Model.notifyChanges();
    assert.strictEqual('Hello sunny day!', el.textContent);
  });

  test('PlaceHolderBindingElementProperty', function() {
    var m = {
      adj: 'cruel',
      noun: 'world'
    };

    var el = document.createElement('div');
    el.addBinding('foo', 'Hello {{adj}} {{noun}}!');
    el.model = m;

    Model.notifyChanges();
    assert.strictEqual('Hello cruel world!', el.getAttribute('foo'));

    el.model.adj = 'happy';
    Model.notifyChanges();
    assert.strictEqual('Hello happy world!', el.getAttribute('foo'));

    el.model = {
      adj: 'sunny',
      noun: 'day'
    };
    Model.notifyChanges();
    assert.strictEqual('Hello sunny day!', el.getAttribute('foo'));

    // Change the binding.
    el.addBinding('foo', 'Goodbye {{ adj }} {{noun}}!');
    Model.notifyChanges();
    assert.strictEqual('Goodbye sunny day!', el.getAttribute('foo'));

    // Remove the binding. Should stop following the model.
    el.removeBinding('foo');
    el.model.adj = 'cloudy';
    Model.notifyChanges();
    assert.strictEqual('Goodbye sunny day!', el.getAttribute('foo'));
  });

  test('DomTreeChanges', function() {
    var d1 = document.createElement('div');
    d1.id = 'd1';
    var d2 = document.createElement('div');
    d2.id = 'd2';
    var d3 = document.createElement('div');
    d3.id = 'd3';
    d3.addBinding('foo', '{{a}}');

    testContainerDiv.appendChild(d1);
    testContainerDiv.appendChild(d2);

    Model.notifyChanges();
    assert.strictEqual('', d3.getAttribute('foo'));

    d1.model = {a: 1};
    d2.model = {a: 2};

    d1.appendChild(d3);
    Model.notifyChanges();
    assert.strictEqual('1', d3.getAttribute('foo'));

    d2.appendChild(d3);
    Model.notifyChanges();
    assert.strictEqual('2', d3.getAttribute('foo'));

    testContainerDiv.innerHTML = '';
  });

  test('InputElementTextBinding', function() {
    var m = {val: 'ping'};

    var el = document.createElement('input');
    el.addValueBinding('val');
    el.model = m;
    Model.notifyChanges();
    assert.strictEqual('ping', el.value);

    el.value = 'pong';
    dispatchEvent('input', el);
    assert.strictEqual('pong', m.val);

    // Try a deep path.
    m = {
      a: {
        b: {
          c: 'ping'
        }
      }
    };

    el.addValueBinding('a.b.c');
    el.model = m;
    Model.notifyChanges();
    assert.strictEqual('ping', el.value);

    el.value = 'pong';
    dispatchEvent('input', el);
    assert.strictEqual('pong', Model.getValueAtPath(m, 'a.b.c'));

    // Start with the model property being absent.
    delete m.a.b.c;
    Model.notifyChanges();
    assert.strictEqual('', el.value);

    el.value = 'pong';
    dispatchEvent('input', el);
    assert.strictEqual('pong', Model.getValueAtPath(m, 'a.b.c'));
    Model.notifyChanges();

    // Model property unreachable (and unsettable).
    delete m.a.b;
    Model.notifyChanges();
    assert.strictEqual('', el.value);

    el.value = 'pong';
    dispatchEvent('input', el);
    assert.strictEqual(undefined, Model.getValueAtPath(m, 'a.b.c'));
  });

  test('SimpleTransform', function() {
    function delegate(path) {
      function toTarget(source) {
        return source + 1;
      }

      function toSource(target) {
        return (+target) - 1;
      }

      return [[path], toTarget, toSource];
    }

    var m = {val: 1};
    var el = document.createElement('input');
    el.addValueBinding('val');
    el.model = m;
    el.modelDelegate = delegate;
    Model.notifyChanges();
    assert.strictEqual('2', el.value);

    el.value = '3';
    dispatchEvent('input', el);
    assert.strictEqual(2, m.val);
  });

  test('DeclarativeTransform', function() {
    var transformArgs;
    var toTargetArgs;

    function MyTrans(var_arg) {
      transformArgs = Array.prototype.slice.call(arguments);
    }
    MyTrans.prototype = {
      toTarget: function(source, path) {
        toTargetArgs = Array.prototype.slice.call(arguments);
        return source + 1;
      },

      toSource: function(target) {
        return +target - 1;
      }
    };

    Transform.registry.myTrans = MyTrans;

    var m = {val: 1};
    var el = document.createElement('input');
    el.addValueBinding('val | myTrans("a", \'b\', 1)');
    el.model = m;
    el.modelDelegate = MDVDelegate;
    Model.notifyChanges();
    assert.strictEqual('2', el.value);
    assert.deepEqual([m.val, 'val'], toTargetArgs);

    el.value = '3';
    dispatchEvent('input', el);
    assert.strictEqual(2, m.val);

    assert.deepEqual(['a', 'b', 1], transformArgs);

    delete Transform.registry.myTrans;
  });

  test('ClassListTransform', function() {
    var el = document.createElement('div');
    el.modelDelegate = MDVDelegate;
    el.addBinding('class', '{{ val | toggle("selected") }}');
    el.model = { val: false };
    Model.notifyChanges();
    assert.strictEqual('', el.className);

    el.model.val = true;
    Model.notifyChanges();
    assert.strictEqual('selected', el.className);

    // Test impicit naming
    el = document.createElement('div');
    el.modelDelegate = MDVDelegate;
    el.addBinding('class', '{{ selected | toggle }}');
    el.model = { selected: false };
    Model.notifyChanges();
    assert.strictEqual('', el.className);

    el.model.selected = true;
    Model.notifyChanges();
    assert.strictEqual('selected', el.className);

    // Test impicit naming
    el = document.createElement('div');
    el.modelDelegate = MDVDelegate;
    el.addBinding('class', 'classA {{ selected | toggle }} classB');
    el.model = { selected: false };
    Model.notifyChanges();
    assert.strictEqual('classA  classB', el.className);

    el.model.selected = true;
    Model.notifyChanges();
    assert.strictEqual('classA selected classB', el.className);
  });

  test('InputElementCheckbox', function() {
    var m = {val: true};

    var el = document.createElement('input');
    el.type = 'checkbox';
    el.addCheckedBinding('val');
    el.model = m;
    Model.notifyChanges();
    assert.strictEqual(true, el.checked);

    m.val = false;
    Model.notifyChanges();
    assert.strictEqual(false, el.checked);

    el.checked = true;
    dispatchEvent('click', el);
    assert.strictEqual(true, m.val);

    el.checked = false;
    dispatchEvent('click', el);
    assert.strictEqual(false, m.val);
  });

  test('InputElementRadio', function() {
    var m = {val1: true, val2: false, val3: false, val4: true};
    var RADIO_GROUP_NAME = 'test';

    var container = document.body.appendChild(document.createElement('div'));
    container.model = m;

    var el1 = container.appendChild(document.createElement('input'));
    el1.type = 'radio';
    el1.name = RADIO_GROUP_NAME;
    el1.addCheckedBinding('val1');

    var el2 = container.appendChild(document.createElement('input'));
    el2.type = 'radio';
    el2.name = RADIO_GROUP_NAME;
    el2.addCheckedBinding('val2');

    var el3 = container.appendChild(document.createElement('input'));
    el3.type = 'radio';
    el3.name = RADIO_GROUP_NAME;
    el3.addCheckedBinding('val3');

    var el4 = container.appendChild(document.createElement('input'));
    el4.type = 'radio';
    el4.name = 'othergroup';
    el4.addCheckedBinding('val4');

    Model.notifyChanges();
    assert.strictEqual(true, el1.checked);
    assert.strictEqual(false, el2.checked);
    assert.strictEqual(false, el3.checked);
    assert.strictEqual(true, el4.checked);

    m.val1 = false;
    m.val2 = true;
    Model.notifyChanges();
    assert.strictEqual(false, el1.checked);
    assert.strictEqual(true, el2.checked);
    assert.strictEqual(false, el3.checked);
    assert.strictEqual(true, el4.checked);

    el1.checked = true;
    dispatchEvent('change', el1);
    assert.strictEqual(true, m.val1);
    assert.strictEqual(false, m.val2);
    assert.strictEqual(false, m.val3);
    assert.strictEqual(true, m.val4);

    el3.checked = true;
    dispatchEvent('change', el3);
    assert.strictEqual(false, m.val1);
    assert.strictEqual(false, m.val2);
    assert.strictEqual(true, m.val3);
    assert.strictEqual(true, m.val4);

    document.body.removeChild(container);
  });

  test('InputElementRadioMultipleForms', function() {
    var m = {val1: true, val2: false, val3: false, val4: true};
    var RADIO_GROUP_NAME = 'test';

    var container = document.body.appendChild(document.createElement('div'));
    container.model = m;
    var form1 = container.appendChild(document.createElement('form'));
    var form2 = container.appendChild(document.createElement('form'));

    var el1 = form1.appendChild(document.createElement('input'));
    el1.type = 'radio';
    el1.name = RADIO_GROUP_NAME;
    el1.addCheckedBinding('val1');

    var el2 = form1.appendChild(document.createElement('input'));
    el2.type = 'radio';
    el2.name = RADIO_GROUP_NAME;
    el2.addCheckedBinding('val2');

    var el3 = form2.appendChild(document.createElement('input'));
    el3.type = 'radio';
    el3.name = RADIO_GROUP_NAME;
    el3.addCheckedBinding('val3');

    var el4 = form2.appendChild(document.createElement('input'));
    el4.type = 'radio';
    el4.name = RADIO_GROUP_NAME;
    el4.addCheckedBinding('val4');

    Model.notifyChanges();
    assert.strictEqual(true, el1.checked);
    assert.strictEqual(false, el2.checked);
    assert.strictEqual(false, el3.checked);
    assert.strictEqual(true, el4.checked);

    el2.checked = true;
    dispatchEvent('change', el2);
    assert.strictEqual(false, m.val1);
    assert.strictEqual(true, m.val2);

    // Radio buttons in form2 should be unaffected
    assert.strictEqual(false, m.val3);
    assert.strictEqual(true, m.val4);

    el3.checked = true;
    dispatchEvent('change', el3);
    assert.strictEqual(true, m.val3);
    assert.strictEqual(false, m.val4);

    // Radio buttons in form1 should be unaffected
    assert.strictEqual(false, m.val1);
    assert.strictEqual(true, m.val2);

    document.body.removeChild(container);
  });

  test('BindToChecked', function() {
    var div = document.createElement('div');
    var child = div.appendChild(document.createElement('div'));
    var input = child.appendChild(document.createElement('input'));
    input.type = 'checkbox';

    var m = {
      a: {
        b: false
      }
    };
    div.model = m;

    input.addCheckedBinding('a.b');

    input.checked = true;
    dispatchEvent('click', input);
    assert.isTrue(m.a.b);

    input.checked = false;
    assert.isTrue(m.a.b);
    dispatchEvent('click', input);
    assert.isFalse(m.a.b);
  });

  test('ExpressionBinding', function() {
    var el = document.createElement('div');
    var m = el.model = {a: 1, b: 2};
    el.modelDelegate = MDVDelegate;
    el.addBinding('foo', '{{a}} + {{b}} = {{ expr(a, b) a + b }}');
    Model.notifyChanges();
    assert.strictEqual('1 + 2 = 3', el.getAttribute('foo'));

    m.a = 4;
    Model.notifyChanges();
    assert.strictEqual('4 + 2 = 6', el.getAttribute('foo'));

    m.b = 8;
    Model.notifyChanges();
    assert.strictEqual('4 + 8 = 12', el.getAttribute('foo'));

    el.model = null;
    Model.notifyChanges();
    assert.strictEqual(' +  = NaN', el.getAttribute('foo'));
  });

  test('MultipleReferences', function() {
    var el = document.createElement('div');
    var m = el.model = {foo: 'bar'};
    el.addBinding('foo', '{{foo}} {{foo}}');
    assert.strictEqual('bar bar', el.getAttribute('foo'));
  });

  test('ExpressionBindingNoCoerce', function() {
    var el = document.createElement('div');
    var m = el.model = {
      a: {
        b: 1
      },
      c: {
        d: 2
      }
    };
    el.modelDelegate = MDVDelegate;
    el.addBinding('foo', '{{ expr(a.b, c.d) b + d }}');
    assert.strictEqual('3', el.getAttribute('foo'));
  });

  /*
   * TODO(rafaelw): Decide if minimal reads should be implemented.
   * https://github.com/toolkitchen/mdv/issues/11
   *
  test('MinimalReads', function() {
    var accessesPerNotifyObservers = Model.observableObjects_ ? 1 : 2;
    var el = document.createElement('div');
    function Data(a, b) {
      this.a_ = a;
      this.b_ = b;
    }
    var aAccess = 0;
    var bAccess = 0;
    Data.prototype = {
      get a() {
        aAccess++;
        return this.a_;
      },
      set a(a) {
        this.a_ = a;
      },
      get b() {
        bAccess++;
        return this.b_;
      },
      set b(b) {
        this.b_ = b;
      }
    }

    el.model = new Data('a', 'b');
    el.addBinding('foo', '{{a}} {{b}}');

    assert.strictEqual('a b', el.getAttribute('foo'));
    assert.strictEqual(1 * accessesPerNotifyObservers, aAccess);
    assert.strictEqual(1 * accessesPerNotifyObservers, bAccess);

    el.model.a = 'c';
    Model.notifyChanges();
    assert.strictEqual('c b', el.getAttribute('foo'));
    assert.strictEqual(2 * accessesPerNotifyObservers, aAccess);
    assert.strictEqual(2 * accessesPerNotifyObservers, bAccess);

    el.model.b = 'd';
    Model.notifyChanges();
    assert.strictEqual('c d', el.getAttribute('foo'));
    assert.strictEqual(3 * accessesPerNotifyObservers, aAccess);
    assert.strictEqual(3 * accessesPerNotifyObservers, bAccess);
  });

  test('ObserveOnElement', function() {
    var d = document.createElement('div');

    var count = 0;
    function callback(c) {
      count++;
    }

    Model.observePath(d, 'model', callback);

    d.model = {};
    Model.notifyChanges();
    assert.strictEqual(1, count);
  });

  test('ObserveOnElement2', function() {
    var div = document.createElement('div');

    var count = 0;
    function callback(c) {
      count++;
    }

    var divModel = div;

    Model.observePath(divModel, 'model', callback);

    divModel.model = {};
    Model.notifyChanges();
    assert.strictEqual(1, count);
  });
  */

});