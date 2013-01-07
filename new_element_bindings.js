// Copyright 2013 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function() {
  'use strict';

  var modelTable = new SideTable('model');
  var modelDelegateTable = new SideTable('modelDelegate');
  var textContentBindingTable = new SideTable('textContentBinding');
  var attributeBindingsTable = new SideTable('attributeBindings');

  function addBinding(attributeName, path) {
    // ElementAttributeBindings takes care of removing old binding as needed.

    var bindings = attributeBindingsTable.get(this);
    if (!bindings) {
      bindings = new ElementAttributeBindings();
      attributeBindingsTable.set(this, bindings);
    }
    bindings.addBinding(this, attributeName, path);
  }

  function removeBinding(attributeName) {
    var bindings = attributeBindingsTable.get(this);
    if (bindings)
      bindings.removeBinding(attributeName);
  }

  function addTextBinding(path) {
    this.removeBinding();

    // Create an "observer" since we don't want to expose valueChanged on
    // text nodes.
    var observer = {
      valueChanged: textNodeValueChanged.bind(null, this)
    };

    var binding = new TextReplacementsBinding(this.model, this.modelDelegate,
                                              path, observer);
    textContentBindingTable.set(this, binding);
    textNodeValueChanged(this, binding);
  }

  function removeTextBinding() {
    var binding = textContentBindingTable.get(this);
    if (binding) {
      binding.unbind();
      textContentBindingTable.delete(this);
    }
  }

  Element.prototype.addBinding = addBinding;
  Element.prototype.removeBinding = removeBinding;
  Text.prototype.addBinding = addTextBinding;
  Text.prototype.removeBinding = removeTextBinding;

  function defineProperty(ctor, name, getter, setter) {
    Object.defineProperty(ctor.prototype, name, {
      get: getter || undefined,
      set: setter || undefined,
      configurable: true,
      enumerable: true
    });
  }


  defineProperty(Attr, 'bindingText', function() {
    var element = this.ownerElement;
    if (!element)
      return null;
    var bindings = attributeBindingsTable.get(element);
    return bindings ? bindings.bindingText(this.name) : null;
  });

  defineProperty(Text, 'bindingText', function() {
    var binding = textContentBindingTable.get(this);
    return binding ? binding.bindingText : null
  });

  function hasOwnModel(node) {
    return modelTable.get(node) !== undefined;
  }

  function hasOwnModelDelegate(node) {
    return modelDelegateTable.get(node) !== undefined;
  }

  var queue = [];

  function enqueue(func) {
    queue.push(func);
  }

  var dirtyCheck = Model.dirtyCheck;
  Model.dirtyCheck = function() {
    // This might need some tweaking.
    dirtyCheck();
    while (queue.length > 0) {
      var f = queue.shift();
      f();
    }
  };

  function hasBindings(node) {
    return attributeBindingsTable.get(node) !== undefined ||
        textContentBindingTable.get(node) !== undefined;
  }

  function modelChanged(node) {
    // TODO(arv): Integrate with shadow dom.
    if (hasBindings(node))
      enqueue(lazyModelChanged.bind(null, node));

    for (var child = node.firstChild; child; child = child.nextSibling) {
      if (!hasOwnModel(child))
        modelChanged(child);
    }
  }

  function modelDelegateChanged(node) {
    // TODO(arv): Integrate with shadow dom.
    if (hasBindings(node))
      enqueue(lazyModelDelegateChanged.bind(null, node));

    for (var child = node.firstChild; child; child = child.nextSibling) {
      if (!hasOwnModelDelegate(child))
        modelDelegateChanged(child);
    }
  }

  function lazyModelChanged(node) {
    var bindings = attributeBindingsTable.get(node);
    if (bindings) {
      bindings.modelChanged(node.model);
    } else {
      var binding = textContentBindingTable.get(node);
      if (binding && binding.setModel(node.model))
        textNodeValueChanged(node, binding);
    }
  }

  function lazyModelDelegateChanged(node) {
    var bindings = attributeBindingsTable.get(node);
    if (bindings) {
      bindings.modelDelegateChanged(node.modelDelegate);
    } else {
      var binding = textContentBindingTable.get(node);
      if (binding && binding.setModelDelegate(node.model, node.modelDelegate))
        textNodeValueChanged(node, binding);
    }
  }

  function inheritedGetter(table) {
    return function() {
      for (var node = this; node; node = node.parentNode) {
        var value = table.get(node);
        if (value !== undefined)
          return value;
      }
      return undefined;
    };
  }

  function inheritedSetter(table, onChange) {
    return function(value) {
      var oldValue = table.get(this);
      if (oldValue === value)
        return;

      table.set(this, value);
      onChange(this);
    };
  }

  defineProperty(Element, 'model',
                 inheritedGetter(modelTable),
                 inheritedSetter(modelTable, modelChanged));
  defineProperty(Element, 'modelDelegate',
                 inheritedGetter(modelDelegateTable),
                 inheritedSetter(modelDelegateTable, modelDelegateChanged));

  defineProperty(Text, 'model',
                 inheritedGetter(modelTable),
                 inheritedSetter(modelTable, modelChanged));
  defineProperty(Text, 'modelDelegate',
                 inheritedGetter(modelDelegateTable),
                 inheritedSetter(modelDelegateTable, modelDelegateChanged));

  function textNodeValueChanged(node, binding) {
    node.data = binding.value;
  }

})();
