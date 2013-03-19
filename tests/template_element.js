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

suite('Template Element', function() {

  var testDiv;

  setup(function() {
    testDiv = document.body.appendChild(document.createElement('div'));
  })

  teardown(function() {
    document.body.removeChild(testDiv);
  });

  function createTestHtml(s) {
    var div = document.createElement('div');
    div.innerHTML = s;
    testDiv.appendChild(div);

    Array.prototype.forEach.call(div.querySelectorAll(
        HTMLTemplateElement.allTemplatesSelectors),
      function(t) {
        HTMLTemplateElement.decorate(t);
      }
    );

    return div;
  }

  function dispatchEvent(type, target) {
    var event = document.createEvent('HTMLEvents');
    event.initEvent(type, true, false);
    target.dispatchEvent(event);
  }

  test('Template', function() {
    var div = createTestHtml(
        '<template instantiate>text</template>');
    div.model = 42;
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('text', div.lastChild.textContent);
  });

  test('TextTemplateWithBinding', function() {
    var div = createTestHtml(
        '<template instantiate>a{{b}}c</template>');
    div.model = {b: 'B'};
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('aBc', div.lastChild.textContent);

    div.model.b = 'b';
    assert.strictEqual('aBc', div.lastChild.textContent);
    Model.notifyChanges();
    assert.strictEqual('abc', div.lastChild.textContent);

    div.model = {b: 'X'};
    assert.strictEqual('abc', div.lastChild.textContent);
    Model.notifyChanges();
    assert.strictEqual('aXc', div.lastChild.textContent);

    div.model = undefined;
    assert.strictEqual('aXc', div.lastChild.textContent);
    Model.notifyChanges();
    assert.strictEqual(1, div.childNodes.length);
  });

  test('TemplateWithTextBinding2', function() {
    var div = createTestHtml(
        '<template instantiate="b">a{{value}}c</template>');
    assert.strictEqual(1, div.childNodes.length);
    div.model = {b: {value: 'B'}};
    assert.strictEqual(1, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('aBc', div.lastChild.textContent);

    div.model.b = {value: 'b'};
    assert.strictEqual('aBc', div.lastChild.textContent);
    Model.notifyChanges();
    assert.strictEqual('abc', div.lastChild.textContent);
  });

  test('TemplateWithAttributeBinding', function() {
    var div = createTestHtml(
        '<template instantiate>' +
        '<div foo="a{{b}}c"></div>' +
        '</template>');
    div.model = {b: 'B'};
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('aBc', div.lastChild.getAttribute('foo'));

    div.model.b = 'b';
    assert.strictEqual('aBc', div.lastChild.getAttribute('foo'));
    Model.notifyChanges();
    assert.strictEqual('abc', div.lastChild.getAttribute('foo'));

    div.model = {b: 'X'};
    assert.strictEqual('abc', div.lastChild.getAttribute('foo'));
    Model.notifyChanges();
    assert.strictEqual('aXc', div.lastChild.getAttribute('foo'));

    div.model = undefined;
    assert.strictEqual('aXc', div.lastChild.getAttribute('foo'));
    Model.notifyChanges();
    assert.strictEqual(1, div.childNodes.length);
  });

  test('TemplateWithAttributeBinding2', function() {
    var div = createTestHtml(
        '<template instantiate>' +
        '<div foo="{{b}}"></div>' +
        '</template>');
    div.model = {b: 'b'};
    assert.strictEqual(1, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('b', div.lastChild.getAttribute('foo'));

    div.model = {b: null};
    assert.strictEqual('b', div.lastChild.getAttribute('foo'));
    Model.notifyChanges();
    assert.isFalse(div.lastChild.hasAttribute('foo'));
  });

  test('Iterate', function() {
    var div = createTestHtml(
        '<template iterate>text</template>');
    assert.strictEqual(1, div.childNodes.length);
    div.model = [0, 1, 2];
    assert.strictEqual(1, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(4, div.childNodes.length);

    div.model.length = 1;
    assert.strictEqual(4, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);

    div.model.push(3, 4);
    assert.strictEqual(2, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(4, div.childNodes.length);

    div.model.splice(1, 1);
    assert.strictEqual(4, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(3, div.childNodes.length);
  });

  test('DOM Stability on Iteration', function() {
    var div = createTestHtml(
        '<template iterate>{{ }}</template>');
    div.model = [1, 2, 3, 4, 5];

    function getInstanceNode(index) {
      var node = div.firstChild.nextSibling;
      while (index-- > 0) {
        node = node.nextSibling;
      }
      return node;
    }

    function setInstanceExpando(index, value) {
      getInstanceNode(index)['expando'] = value;
    }

    function getInstanceExpando(index) {
      return getInstanceNode(index)['expando'];
    }

    Model.notifyChanges();
    setInstanceExpando(0, 0);
    setInstanceExpando(1, 1);
    setInstanceExpando(2, 2);
    setInstanceExpando(3, 3);
    setInstanceExpando(4, 4);

    div.model.shift();
    div.model.pop();

    Model.notifyChanges();
    assert.strictEqual(1, getInstanceExpando(0));
    assert.strictEqual(2, getInstanceExpando(1));
    assert.strictEqual(3, getInstanceExpando(2));

    div.model.unshift(5);
    div.model[2] = 6;
    div.model.push(7);

    Model.notifyChanges();
    assert.strictEqual(undefined, getInstanceExpando(0));
    assert.strictEqual(1, getInstanceExpando(1));
    assert.strictEqual(undefined, getInstanceExpando(2));
    assert.strictEqual(3, getInstanceExpando(3));
    assert.strictEqual(undefined, getInstanceExpando(4));

    setInstanceExpando(0, 5);
    setInstanceExpando(2, 6);
    setInstanceExpando(4, 7);

    div.model.splice(2, 0, 8);

    Model.notifyChanges();
    assert.strictEqual(5, getInstanceExpando(0));
    assert.strictEqual(1, getInstanceExpando(1));
    assert.strictEqual(undefined, getInstanceExpando(2));
    assert.strictEqual(6, getInstanceExpando(3));
    assert.strictEqual(3, getInstanceExpando(4));
    assert.strictEqual(7, getInstanceExpando(5));
  });

  test('Iterate2', function() {
    var div = createTestHtml(
        '<template iterate>{{value}}</template>');
    assert.strictEqual(1, div.childNodes.length);
    div.model = [
      {value: 0},
      {value: 1},
      {value: 2}
    ];
    assert.strictEqual(1, div.childNodes.length);
    Model.notifyChanges();
    assert.strictEqual(4, div.childNodes.length);
    assert.strictEqual('0', div.childNodes[1].textContent);
    assert.strictEqual('1', div.childNodes[2].textContent);
    assert.strictEqual('2', div.childNodes[3].textContent);

    div.model[1].value = 'One';
    Model.notifyChanges();
    assert.strictEqual(4, div.childNodes.length);
    assert.strictEqual('0', div.childNodes[1].textContent);
    assert.strictEqual('One', div.childNodes[2].textContent);
    assert.strictEqual('2', div.childNodes[3].textContent);

    div.model.splice(0, 1, {value: 'Zero'});
    Model.notifyChanges();
    assert.strictEqual(4, div.childNodes.length);
    assert.strictEqual('Zero', div.childNodes[1].textContent);
    assert.strictEqual('One', div.childNodes[2].textContent);
    assert.strictEqual('2', div.childNodes[3].textContent);
  });

  test('TemplateWithInputValue', function() {
    var div = createTestHtml(
        '<template instantiate>' +
        '<input value="{{x}}">' +
        '</template>');
    div.model = {x: 'hi'};
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('hi', div.lastChild.value);

    div.model.x = 'bye';
    assert.strictEqual('hi', div.lastChild.value);
    Model.notifyChanges();
    assert.strictEqual('bye', div.lastChild.value);

    div.lastChild.value = 'hello';
    dispatchEvent('input', div.lastChild);
    assert.strictEqual('hello', div.model.x);
    Model.notifyChanges();
    assert.strictEqual('hello', div.lastChild.value);
  });

//////////////////////////////////////////////////////////////////////////////

  test('Decorated', function() {
    var div = createTestHtml(
        '<template instantiate="XX" id="t1">' +
          '<p>Crew member: {{name}}, Job title: {{title}}</p>' +
        '</template>' +
        '<template instantiate="XY" id="t2" ref="t1"></template>');

    div.model = {
      scope: 'XX',
      XX: {name: 'Leela', title: 'Captain'},
      XY: {name: 'Fry', title: 'Delivery boy'},
      XZ: {name: 'Zoidberg', title: 'Doctor'}
    };
    Model.notifyChanges();

    var t1 = document.getElementById('t1');
    var instance = t1.nextElementSibling;
    assert.strictEqual('Crew member: Leela, Job title: Captain', instance.textContent);

    var t2 = document.getElementById('t2');
    instance = t2.nextElementSibling;
    assert.strictEqual('Crew member: Fry, Job title: Delivery boy',
                 instance.textContent);

    assert.strictEqual(4, div.children.length);
    assert.strictEqual(4, div.childNodes.length);

    assert.strictEqual('P', div.childNodes[1].tagName);
    assert.strictEqual('P', div.childNodes[3].tagName);
  });

  test('DefaultStyles', function() {
    var t = document.createElement('template');
    HTMLTemplateElement.decorate(t);

    document.body.appendChild(t);
    assert.strictEqual('none', getComputedStyle(t, null).display);

    document.body.removeChild(t);
  });

  test('Instantiate', function() {
    var div = createTestHtml('<template instantiate>Hi {{ name }}</template>');
    div.model = {name: 'Leela'};
    Model.notifyChanges();
    assert.strictEqual('Hi Leela', div.childNodes[1].textContent);
  });

  test('InstantiateImperative', function() {
    var div = createTestHtml(
        '<template>' +
          'Hi {{ name }}' +
        '</template>');
    var t = div.firstChild;

    div.model = {name: 'Leela'};
    t.instantiate = '';
    Model.notifyChanges();
    assert.strictEqual('Hi Leela', div.childNodes[1].textContent);
  });

  test('InstantiatePlaceHolderHasNewLine', function() {
    var div = createTestHtml('<template instantiate>Hi {{\nname\n}}</template>');
    div.model = {name: 'Leela'};
    Model.notifyChanges();
    assert.strictEqual('Hi Leela', div.childNodes[1].textContent);
  });

  test('InstantiateWithRef', function() {
    var id = 't' + Math.random();
    var div = createTestHtml(
        '<template id="' + id +'">' +
          'Hi {{ name }}' +
        '</template>' +
        '<template ref="' + id + '" instantiate></template>');

    var t1 = div.firstChild;
    var t2 = div.childNodes[1];

    assert.strictEqual(t1, t2.ref);

    div.model = {name: 'Fry'};
    Model.notifyChanges();
    assert.strictEqual('Hi Fry', t2.nextSibling.textContent);
  });

  test('InstantiateWithScope', function() {
    var data = {
      scope: 'XX',
      XX: {name: 'Leela', title: 'Captain'},
      XY: {name: 'Fry', title: 'Delivery boy'},
      XZ: {name: 'Zoidberg', title: 'Doctor'}
    };

    var div = createTestHtml(
        '<template instantiate="XX">Hi {{ name }}</template>');

    div.model = data;
    Model.notifyChanges();
    assert.strictEqual('Hi Leela', div.childNodes[1].textContent);
  });

  test('InstantiateChanged', function() {
    var data = {
      scope: 'XX',
      XX: {name: 'Leela', title: 'Captain'},
      XY: {name: 'Fry', title: 'Delivery boy'},
      XZ: {name: 'Zoidberg', title: 'Doctor'}
    };

    var div = createTestHtml(
        '<template instantiate="XX">Hi {{ name }}</template>');

    var t = div.firstChild;
    div.model = data;
    Model.notifyChanges();

    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('Hi Leela', t.nextSibling.textContent);

    t.instantiate = 'XZ';
    Model.notifyChanges();

    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('Hi Zoidberg', t.nextSibling.textContent);
  });

  test('BindToClassName', function() {
    var div = createTestHtml(
        '<template>' +
          '<div class="foo {{ val | toggle(\'bar\') }}"></div>' +
        '</template>');
    var t = div.firstChild;

    div.model = { val: false};
    div.modelDelegate = MDVDelegate;
    t.instantiate = '';
    Model.notifyChanges();
    assert.strictEqual('foo ', div.childNodes[1].className);

    div.model.val = true;
    Model.notifyChanges();
    assert.strictEqual('foo bar', div.childNodes[1].className);
  });

  function assertNodesAre() {
    // <template> is at index 0 and instances starts at 1 and use 2 nodes each.
    var startIndex = 1;
    var nodesPerInstance = 1;
    assert.strictEqual(arguments.length * nodesPerInstance + startIndex,
                 div.childNodes.length);
    var model = Model.getValueAtPath(t.model, t.iterate);

    for (var i = 0; i < arguments.length; i++) {
      var targetNode = div.childNodes[i * nodesPerInstance + startIndex];
      assert.strictEqual(arguments[i], targetNode.textContent);
      assert.strictEqual(JSON.stringify(model[i]),
                   JSON.stringify(targetNode.model));
    }
  }

  test('Iterate', function() {
    div = createTestHtml('<template iterate="contacts">Hi {{ name }}</template>');
    t = div.firstChild;

    var m = div.model = {
      contacts: [
        {name: 'Raf'},
        {name: 'Arv'},
        {name: 'Neal'}
      ]
    };
    Model.notifyChanges();

    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal');

    m.contacts.push({name: 'Alex'});
    Model.notifyChanges();
    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal', 'Hi Alex');

    m.contacts.splice(0, 2, {name: 'Rafael'}, {name: 'Erik'});
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Erik', 'Hi Neal', 'Hi Alex');

    m.contacts.splice(1, 2);
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Alex');

    m.contacts.splice(1, 0, {name: 'Erik'}, {name: 'Dimitri'});
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Erik', 'Hi Dimitri', 'Hi Alex');

    m.contacts.splice(0, 1, {name: 'Tab'}, {name: 'Neal'});
    Model.notifyChanges();
    assertNodesAre('Hi Tab', 'Hi Neal', 'Hi Erik', 'Hi Dimitri', 'Hi Alex');

    m.contacts = [{name: 'Alex'}];
    Model.notifyChanges();
    assertNodesAre('Hi Alex');

    m.contacts.length = 0;
    Model.notifyChanges();
    assertNodesAre();
  });

  test('IterateModelSet', function() {
    div = createTestHtml(
        '<template iterate="contacts">' +
          'Hi {{ name }}' +
        '</template>');
    var m = div.model = {
      contacts: [
        {name: 'Raf'},
        {name: 'Arv'},
        {name: 'Neal'}
      ]
    };
    Model.notifyChanges();
    t = div.firstChild;

    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal');
  });

  test('IterateEmptyIteratePath', function() {
    div = createTestHtml('<template iterate>Hi {{ name }}</template>');
    t = div.firstChild;

    var m = div.model = [
      {name: 'Raf'},
      {name: 'Arv'},
      {name: 'Neal'}
    ];
    Model.notifyChanges();

    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal');

    m.push({name: 'Alex'});
    Model.notifyChanges();
    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal', 'Hi Alex');

    m.splice(0, 2, {name: 'Rafael'}, {name: 'Erik'});
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Erik', 'Hi Neal', 'Hi Alex');

    m.splice(1, 2);
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Alex');

    m.splice(1, 0, {name: 'Erik'}, {name: 'Dimitri'});
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Erik', 'Hi Dimitri', 'Hi Alex');

    m.splice(0, 1, {name: 'Tab'}, {name: 'Neal'});
    Model.notifyChanges();
    assertNodesAre('Hi Tab', 'Hi Neal', 'Hi Erik', 'Hi Dimitri', 'Hi Alex');

    m = div.model = [{name: 'Alex'}];
    Model.notifyChanges();
    assertNodesAre('Hi Alex');
  });

  test('IterateNullModel', function() {
    div = createTestHtml('<template iterate>Hi {{ name }}</template>');
    t = div.firstChild;

    var m = div.model = null;
    Model.notifyChanges();
    assert.strictEqual(1, div.childNodes.length);

    t.iterate = '';
    m = div.model = {};
    Model.notifyChanges();
    assert.strictEqual(1, div.childNodes.length);
  });

  test('IterateReuse', function() {
    div = createTestHtml('<template iterate>Hi {{ name }}</template>');
    t = div.firstChild;

    var m = div.model = [
      {name: 'Raf'},
      {name: 'Arv'},
      {name: 'Neal'}
    ];
    Model.notifyChanges();

    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal');
    var node1 = div.childNodes[1];
    var node2 = div.childNodes[2];
    var node3 = div.childNodes[3];

    m.splice(1, 1, {name: 'Erik'});
    Model.notifyChanges();
    assertNodesAre('Hi Raf', 'Hi Erik', 'Hi Neal');
    assert.strictEqual(node1, div.childNodes[1],
        'model[0] did not change so the node should not have changed');
    assert.notStrictEqual(node2, div.childNodes[2],
        'Should not reuse when replacing');
    assert.strictEqual(node3, div.childNodes[3],
        'model[2] did not change so the node should not have changed');

    node2 = div.childNodes[2];
    m.splice(0, 0, {name: 'Alex'});
    Model.notifyChanges();
    assertNodesAre('Hi Alex', 'Hi Raf', 'Hi Erik', 'Hi Neal');
  });

  test('TwoLevelsDeepBug', function() {
    div = createTestHtml(
      '<template instantiate><span><span>{{ foo }}</span></span></template>');

    div.model = {foo: 'bar'};
    Model.notifyChanges();

    assert.strictEqual('bar',
                 div.childNodes[1].childNodes[0].childNodes[0].textContent);
  });

  test('Checked', function() {
    var div = createTestHtml(
        '<template>' +
          '<input type="checkbox" checked="{{a}}">' +
        '</template>');
    var t = div.firstChild;
    var m = div.model = {
      a: true
    };
    t.instantiate = '';
    Model.notifyChanges();

    var instanceInput = t.nextSibling;
    assert.isTrue(instanceInput.checked);

    instanceInput.checked = false;
    dispatchEvent('click', instanceInput);
    assert.isFalse(instanceInput.checked);

    instanceInput.checked = true;
    dispatchEvent('click', instanceInput);
    assert.isTrue(instanceInput.checked);
  });

  function nestedHelper(s, start) {
    var div = createTestHtml(s);

    var m = {
      a: {
        b: 1,
        c: {d: 2}
      },
    };

    div.model = m;
    Model.notifyChanges();

    var i = start;
    assert.strictEqual('1', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('2', div.childNodes[i++].textContent);

    m.a.b = 11;
    Model.notifyChanges();
    assert.strictEqual('11', div.childNodes[start].textContent);

    m.a.c = {d: 22};
    Model.notifyChanges();
    assert.strictEqual('22', div.childNodes[start + 2].textContent);
  }

  test('Nested', function() {
    nestedHelper(
        '<template instantiate="a">' +
          '{{b}}' +
          '<template instantiate="c">' +
            '{{d}}' +
          '</template>' +
        '</template>', 1);
  });

  test('NestedWithRef', function() {
    nestedHelper(
        '<template id="inner">{{d}}</template>' +
        '<template id="outer" instantiate="a">' +
          '{{b}}' +
          '<template ref="inner" instantiate="c"></template>' +
        '</template>', 2);
  });

  function nestedIterateInstantiateHelper(s, start) {
    var div = createTestHtml(s);

    var m = {
      a: [
        {
          b: 1,
          c: {d: 11}
        },
        {
          b: 2,
          c: {d: 22}
        }
      ]
    };

    div.model = m;
    Model.notifyChanges();

    var i = start;
    assert.strictEqual('1', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('11', div.childNodes[i++].textContent);
    assert.strictEqual('2', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('22', div.childNodes[i++].textContent);

    m.a[1] = {
      b: 3,
      c: {d: 33}
    };

    Model.notifyChanges();
    assert.strictEqual('3', div.childNodes[start + 3].textContent);
    assert.strictEqual('33', div.childNodes[start + 5].textContent);
  }

  test('NestedIterateInstantiate', function() {
    nestedIterateInstantiateHelper(
        '<template iterate="a">' +
          '{{b}}' +
          '<template instantiate="c">' +
            '{{d}}' +
          '</template>' +
        '</template>', 1);
  });

  test('NestedIterateInstantiateWithRef', function() {
    nestedIterateInstantiateHelper(
        '<template id="inner">' +
          '{{d}}' +
        '</template>' +
        '<template iterate="a">' +
          '{{b}}' +
          '<template ref="inner" instantiate="c"></template>' +
        '</template>', 2);
  });

  function nestedIterateIterateHelper(s, start) {
    var div = createTestHtml(s);

    var m = {
      a: [
        {
          b: 1,
          c: [{d: 11}, {d: 12}]
        },
        {
          b: 2,
          c: [{d: 21}, {d: 22}]
        }
      ]
    };

    div.model = m;
    Model.notifyChanges();

    var i = start;
    assert.strictEqual('1', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('11', div.childNodes[i++].textContent);
    assert.strictEqual('12', div.childNodes[i++].textContent);
    assert.strictEqual('2', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('21', div.childNodes[i++].textContent);
    assert.strictEqual('22', div.childNodes[i++].textContent);

    m.a[1] = {
      b: 3,
      c: [{d: 31}, {d: 32}, {d: 33}]
    };

    i = start + 4;
    Model.notifyChanges();
    assert.strictEqual('3', div.childNodes[start + 4].textContent);
    assert.strictEqual('31', div.childNodes[start + 6].textContent);
    assert.strictEqual('32', div.childNodes[start + 7].textContent);
    assert.strictEqual('33', div.childNodes[start + 8].textContent);
  }

  test('NestedIterateIterate', function() {
    nestedIterateIterateHelper(
        '<template iterate="a">' +
          '{{b}}' +
          '<template iterate="c">' +
            '{{d}}' +
          '</template>' +
        '</template>', 1);
  });

  test('NestedIterateIterateWithRef', function() {
    nestedIterateIterateHelper(
        '<template id="inner">' +
          '{{d}}' +
        '</template>' +
        '<template iterate="a">' +
          '{{b}}' +
          '<template ref="inner" iterate="c"></template>' +
        '</template>', 2);
  });

  test('NestedIterateSelfRef', function() {
    var div = createTestHtml(
        '<template id="t" iterate="">' +
          '{{name}}' +
          '<template ref="t" iterate="items"></template>' +
        '</template>');

    var m = [
      {
        name: 'Item 1',
        items: [
          {
            name: 'Item 1.1',
            items: [
              {
                 name: 'Item 1.1.1',
                 items: []
              }
            ]
          },
          {
            name: 'Item 1.2'
          }
        ]
      },
      {
        name: 'Item 2',
        items: []
      },
    ];

    div.model = m;
    Model.notifyChanges();

    var i = 1;
    assert.strictEqual('Item 1', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('Item 1.1', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('Item 1.1.1', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('Item 1.2', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('Item 2', div.childNodes[i++].textContent);

    m[0] = {
      name: 'Item 1 changed'
    };

    i = 1;
    Model.notifyChanges();
    assert.strictEqual('Item 1 changed', div.childNodes[i++].textContent);
    assert.strictEqual('TEMPLATE', div.childNodes[i++].tagName);
    assert.strictEqual('Item 2', div.childNodes[i++].textContent);
  });

  test('NestedIterateTableMixedSemanticNative', function() {
    if (!hasNativeTemplates)
      return;

    var div = createTestHtml(
        '<table><tbody>' +
          '<template iterate>' +
            '<tr>' +
              '<td template iterate class="{{ val }}">{{ val }}</td>' +
            '</tr>' +
          '</template>' +
        '</tbody></table>');

    var m = [
      [{ val: 0 }, { val: 1 }],
      [{ val: 2 }, { val: 3 }]
    ];

    div.model = m;
    Model.notifyChanges();

    var i = 1;
    var tbody = div.childNodes[0].childNodes[0];

    // 1 for the <tr template>, 2 * (1 tr)
    assert.strictEqual(3, tbody.childNodes.length);

    // 1 for the <td template>, 2 * (1 td)
    assert.strictEqual(3, tbody.childNodes[1].childNodes.length);
    assert.strictEqual('0', tbody.childNodes[1].childNodes[1].textContent)
    assert.strictEqual('1', tbody.childNodes[1].childNodes[2].textContent)

    // 1 for the <td template>, 2 * (1 td)
    assert.strictEqual(3, tbody.childNodes[2].childNodes.length);
    assert.strictEqual('2', tbody.childNodes[2].childNodes[1].textContent)
    assert.strictEqual('3', tbody.childNodes[2].childNodes[2].textContent)

    // Asset the 'class' binding is retained on the semantic template (just check
    // the last one).
    assert.strictEqual('3', tbody.childNodes[2].childNodes[2].getAttribute("class"));
  });

  test('NestedIterateTable', function() {
    var div = createTestHtml(
        '<table><tbody>' +
          '<tr template iterate>' +
            '<td template iterate class="{{ val }}">{{ val }}</td>' +
          '</tr>' +
        '</tbody></table>');

    var m = [
      [{ val: 0 }, { val: 1 }],
      [{ val: 2 }, { val: 3 }]
    ];

    div.model = m;
    Model.notifyChanges();

    var i = 1;
    var tbody = div.childNodes[0].childNodes[0];

    // 1 for the <tr template>, 2 * (1 tr)
    assert.strictEqual(3, tbody.childNodes.length);

    // 1 for the <td template>, 2 * (1 td)
    assert.strictEqual(3, tbody.childNodes[1].childNodes.length);
    assert.strictEqual('0', tbody.childNodes[1].childNodes[1].textContent)
    assert.strictEqual('1', tbody.childNodes[1].childNodes[2].textContent)

    // 1 for the <td template>, 2 * (1 td)
    assert.strictEqual(3, tbody.childNodes[2].childNodes.length);
    assert.strictEqual('2', tbody.childNodes[2].childNodes[1].textContent)
    assert.strictEqual('3', tbody.childNodes[2].childNodes[2].textContent)

    // Asset the 'class' binding is retained on the semantic template (just check
    // the last one).
    assert.strictEqual('3', tbody.childNodes[2].childNodes[2].getAttribute("class"));
  });

  test('NestedIterateDeletionOfMultipleSubTemplates', function() {
    var div = createTestHtml(
        '<ul>' +
          '<template iterate id=t1>' +
            '<li>{{name}}' +
              '<ul>' +
                '<template ref=t1 iterate="items"></template>' +
              '</ul>' +
            '</li>' +
          '</template>' +
        '</ul>');

    var m = [
      {
        name: 'Item 1',
        items: [
          {
            name: 'Item 1.1'
          }
        ]
      }
    ];

    div.model = m;

    Model.notifyChanges();
    m.splice(0, 1);
    Model.notifyChanges();
  });

  test('DeepNested', function() {
    var div = createTestHtml(
      '<template instantiate="a">' +
        '<p>' +
          '<template instantiate="b">' +
            '{{ c }}' +
          '</template>' +
        '</p>' +
      '</template>');

    var m = div.model = {
      a: {
        b: {
          c: 42
        }
      }
    };
    Model.notifyChanges();

    assert.strictEqual('P', div.childNodes[1].tagName);
    assert.strictEqual('TEMPLATE', div.childNodes[1].firstChild.tagName);
    assert.strictEqual('42', div.childNodes[1].childNodes[1].textContent);
  });

  test('TemplateContentRemoved', function() {
    var div = createTestHtml('<template instantiate>{{ }}</template>');
    div.model = 42;
    Model.notifyChanges();
    assert.strictEqual('42', div.childNodes[1].textContent);
    assert.strictEqual('', div.childNodes[0].textContent);
  });

  test('TemplateContentRemovedEmptyArray', function() {
    var div = createTestHtml('<template iterate>Remove me</template>');
    div.model = [];
    Model.notifyChanges();
    assert.strictEqual(1, div.childNodes.length);
    assert.strictEqual('', div.childNodes[0].textContent);
  });

  test('TemplateContentRemovedNested', function() {
    var div = createTestHtml(
        '<template instantiate>' +
          '{{ a }}' +
          '<template instantiate>' +
            '{{ b }}' +
          '</template>' +
        '</template>');

    div.model = {
      a: 1,
      b: 2
    };
    Model.notifyChanges();

    assert.strictEqual('', div.childNodes[0].textContent);
    assert.strictEqual('1', div.childNodes[1].textContent);
    assert.strictEqual('', div.childNodes[2].textContent);
    assert.strictEqual('2', div.childNodes[3].textContent);
  });

  test('InstantiateWithUndefinedModel', function() {
    var div = createTestHtml('<template instantiate>{{ a }}</template>');

    div.model = {a: 42};
    Model.notifyChanges();
    assert.strictEqual('42', div.childNodes[1].textContent);

    div.model = undefined;
    Model.notifyChanges();
    assert.strictEqual(1, div.childNodes.length);

    div.model = {a: 42};
    Model.notifyChanges();
    assert.strictEqual('42', div.childNodes[1].textContent);
  });

  test('InstantiateNested', function() {
    var div = createTestHtml(
        '<template instantiate>' +
          'Name: {{ name }}' +
          '<template instantiate="wife">' +
            'Wife: {{ name }}' +
          '</template>' +
          '<template instantiate="child">' +
            'Child: {{ name }}' +
          '</template>' +
        '</template>');

    var m = div.model = {
      name: 'Hermes',
      wife: {
        name: 'LaBarbara'
      }
    };
    Model.notifyChanges();

    assert.strictEqual(5, div.childNodes.length);
    assert.strictEqual('Name: Hermes', div.childNodes[1].textContent);
    assert.strictEqual('Wife: LaBarbara', div.childNodes[3].textContent);

    m.child = {name: 'Dwight'};
    Model.notifyChanges();
    assert.strictEqual(6, div.childNodes.length);
    assert.strictEqual('Child: Dwight', div.childNodes[5].textContent);

    delete m.wife;
    Model.notifyChanges();
    assert.strictEqual(5, div.childNodes.length);
    assert.strictEqual('Child: Dwight', div.childNodes[4].textContent);
  });

  test('InstantiateRecursive', function() {
    var div = createTestHtml(
        '<template instantiate id="t">' +
          'Name: {{ name }}' +
          '<template instantiate="friend" ref="t"></template>' +
        '</template>');

    var m = div.model = {
      name: 'Fry',
      friend: {
        name: 'Bender'
      }
    };
    Model.notifyChanges();

    assert.strictEqual(5, div.childNodes.length);
    assert.strictEqual('Name: Fry', div.childNodes[1].textContent);
    assert.strictEqual('Name: Bender', div.childNodes[3].textContent);

    m.friend.friend = {name: 'Leela'};
    Model.notifyChanges();
    assert.strictEqual(7, div.childNodes.length);
    assert.strictEqual('Name: Leela', div.childNodes[5].textContent);

    m.friend = {name: 'Leela'};
    Model.notifyChanges();
    assert.strictEqual(5, div.childNodes.length);
    assert.strictEqual('Name: Leela', div.childNodes[3].textContent);
  });

  test('ChangeFromInstantiateToIterate', function() {
    var div = createTestHtml(
        '<template instantiate="a">' +
          '{{ length }}' +
        '</template>');
    var template = div.firstChild;

    var m = div.model = {
      a: [
        {length: 0},
        {
          length: 1,
          b: {length: 4}
        },
        {length: 2}
      ]
    };
    Model.notifyChanges();

    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('3', div.childNodes[1].textContent);

    template.iterate = 'a';
    Model.notifyChanges();
    assert.strictEqual(4, div.childNodes.length);
    assert.strictEqual('0', div.childNodes[1].textContent);
    assert.strictEqual('1', div.childNodes[2].textContent);
    assert.strictEqual('2', div.childNodes[3].textContent);

    template.instantiate = 'a.1.b';
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('4', div.childNodes[1].textContent);
  });

  test('ChangeRefId', function() {
    var div = createTestHtml(
        '<template id="a">a:{{ }}</template>' +
        '<template id="b">b:{{ }}</template>' +
        '<template iterate>' +
          '<template ref="a" instantiate></template>' +
        '</template>');
    div.model = [];
    Model.notifyChanges();

    assert.strictEqual(3, div.childNodes.length);

    document.getElementById('a').id = 'old-a';
    document.getElementById('b').id = 'a';

    div.model.push(1, 2);
    Model.notifyChanges();

    assert.strictEqual(7, div.childNodes.length);
    assert.strictEqual('b:1', div.childNodes[4].textContent);
    assert.strictEqual('b:2', div.childNodes[6].textContent);
  });

  test('DynamicallyDecoratedNestedTemplateScope', function() {
    var div = createTestHtml(
        '<template instantiate="inner">' +
        '<div id="container"></div>' +
        '</template>');
    div.model = {inner: {foo: 'bar'}};
    Model.notifyChanges();
    var container = div.querySelector('#container');
    container.innerHTML = '<template instantiate><b>{{foo}}</b></template>';
    HTMLTemplateElement.decorate(div.querySelectorAll('template')[1]);
    Model.notifyChanges();
    assert.strictEqual('bar', div.querySelector('b').textContent);
  });

  test('Content', function() {
    var div = createTestHtml(
        '<template><a></a></template>' +
        '<template><b></b></template>');
    var templateA = div.firstChild;
    var templateB = div.lastChild;
    var contentA = templateA.content;
    var contentB = templateB.content;
    assert.notStrictEqual(contentA, undefined);

    assert.notStrictEqual(templateA.ownerDocument, contentA.ownerDocument);
    assert.notStrictEqual(templateB.ownerDocument, contentB.ownerDocument);

    assert.strictEqual(templateA.ownerDocument, templateB.ownerDocument);
    assert.strictEqual(contentA.ownerDocument, contentB.ownerDocument);

    assert.strictEqual(templateA.ownerDocument.defaultView, window);
    assert.strictEqual(templateB.ownerDocument.defaultView, window);

    assert.strictEqual(contentA.ownerDocument.defaultView, null);
    assert.strictEqual(contentB.ownerDocument.defaultView, null);

    assert.strictEqual(contentA.firstChild, contentA.lastChild);
    assert.strictEqual(contentA.firstChild.tagName, 'A');

    assert.strictEqual(contentB.firstChild, contentB.lastChild);
    assert.strictEqual(contentB.firstChild.tagName, 'B');
  });

  test('NestedContent', function() {
    var div = createTestHtml(
        '<template>' +
        '<template></template>' +
        '</template>');
    var templateA = div.firstChild;
    var templateB = templateA.content.firstChild;

    assert.strictEqual(templateA.content.ownerDocument, templateB.ownerDocument);
    assert.strictEqual(templateA.content.ownerDocument,
                 templateB.content.ownerDocument);
  });

  test('IterateTemplateModel', function() {
    div = createTestHtml('<template iterate="contacts">Hi {{ name }}</template>');
    t = div.firstChild;

    var m = t.model = {
      contacts: [
        {name: 'Raf'},
        {name: 'Arv'},
        {name: 'Neal'}
      ]
    };
    Model.notifyChanges();

    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal');

    m.contacts.push({name: 'Alex'});
    Model.notifyChanges();
    assertNodesAre('Hi Raf', 'Hi Arv', 'Hi Neal', 'Hi Alex');

    m.contacts.splice(0, 2, {name: 'Rafael'}, {name: 'Erik'});
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Erik', 'Hi Neal', 'Hi Alex');

    m.contacts.splice(1, 2);
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Alex');

    m.contacts.splice(1, 0, {name: 'Erik'}, {name: 'Dimitri'});
    Model.notifyChanges();
    assertNodesAre('Hi Rafael', 'Hi Erik', 'Hi Dimitri', 'Hi Alex');

    m.contacts.splice(0, 1, {name: 'Tab'}, {name: 'Neal'});
    Model.notifyChanges();
    assertNodesAre('Hi Tab', 'Hi Neal', 'Hi Erik', 'Hi Dimitri', 'Hi Alex');

    m.contacts = [{name: 'Alex'}];
    Model.notifyChanges();
    assertNodesAre('Hi Alex');

    m.contacts.length = 0;
    Model.notifyChanges();
    assertNodesAre();
  });

  test('ModelOnTemplate', function() {
    var div = createTestHtml('<template instantiate>{{x}}</template>');
    var t = div.firstChild;
    t.model = {x: 1};
    Model.notifyChanges();
    assert.strictEqual(2, div.childNodes.length);
    assert.strictEqual('1', div.childNodes[1].textContent);

    t.model = {x: 2};
    assert.strictEqual('1', div.childNodes[1].textContent);
    Model.notifyChanges();
    assert.strictEqual('2', div.childNodes[1].textContent);

    div.model = {x: 3};
    t.model = undefined;
    assert.strictEqual('2', div.childNodes[1].textContent);
    Model.notifyChanges();
    assert.strictEqual('3', div.childNodes[1].textContent);
  });

  function createShadowTestHtml(s) {
    var div = document.createElement('div');
    var root = div.webkitCreateShadowRoot();
    root.innerHTML = s;
    testDiv.appendChild(div);

    Array.prototype.forEach.call(root.querySelectorAll(
        HTMLTemplateElement.allTemplatesSelectors),
      function(t) {
        HTMLTemplateElement.decorate(t);
      }
    );

    return root;
  }

  test('InstantiateShadowDOM', function() {
    if (HTMLElement.prototype.webkitCreateShadowRoot) {
      var root = createShadowTestHtml(
          '<template instantiate>Hi {{ name }}</template>');
      root.model = {name: 'Leela'};
      Model.notifyChanges();
      assert.strictEqual('Hi Leela', root.childNodes[1].textContent);
    }
  });

  // Needs to be global.
  this.testHelper = undefined;

  // https://github.com/toolkitchen/mdv/issues/8
  test('UnbindingInNestedInstantiate', function() {
    var div = createTestHtml(
      '<template instantiate="outer">' +
        '<template instantiate="inner">' +
          '{{ expr(age) testHelper(age) }}' +
        '</template>' +
      '</template>');

    var count = 0;
    testHelper = function(value) {
      assert.strictEqual(42, value);
      count++;
    };

    div.model = {
      outer: {
        inner: {
          age: 42
        }
      }
    };
    div.modelDelegate = MDVDelegate;

    Model.notifyChanges();
    assert.strictEqual(1, count);

    testHelper = function(value) {
      fail('Should not be called on disconnected instance');
    };

    var inner = div.model.outer.inner;
    div.model.outer = null;
    inner.age = 'FAIL';

    Model.notifyChanges();
    assert.strictEqual(1, count);

    div.model.outer = {inner: {age: 2}};

    testHelper = function(value) {
      assert.strictEqual(2, value);
      count++;
    };

    Model.notifyChanges();
    assert.strictEqual(2, count);

    testHelper = undefined;
  });

  test('CreateIntance', function() {
    var div = createTestHtml(
      '<template instantiate=a>' +
        '<template instantiate=b>' +
          '{{text}}' +
        '</template>' +
      '</template>');
    var outer = div.firstChild;

    var instance = outer.createInstance(null, null);
    assert.strictEqual(instance.firstChild.ref, outer.content.firstChild);

    var instance2 =  outer.createInstance(null, null);
    assert.strictEqual(instance.firstChild.ref, instance2.firstChild.ref);
  });

  test('Bootstrap', function() {
    var div = document.createElement('div');
    div.innerHTML =
      '<template>' +
        '<div></div>' +
        '<template>' +
          'Hello' +
        '</template>' +
      '</template>';

    HTMLTemplateElement.bootstrap(div);
    var template = div.firstChild;
    assert.strictEqual(2, template.content.childNodes.length);
    var template2 = template.content.firstChild.nextSibling;
    assert.strictEqual(1, template2.content.childNodes.length);
    assert.strictEqual('Hello', template2.content.firstChild.textContent);

    var template = document.createElement('template');
    template.innerHTML =
      '<template>' +
        '<div></div>' +
        '<template>' +
          'Hello' +
        '</template>' +
      '</template>';

    HTMLTemplateElement.bootstrap(template);
    var template2 = template.content.firstChild;
    assert.strictEqual(2, template2.content.childNodes.length);
    var template3 = template2.content.firstChild.nextSibling;
    assert.strictEqual(1, template3.content.childNodes.length);
    assert.strictEqual('Hello', template3.content.firstChild.textContent);
  });

});