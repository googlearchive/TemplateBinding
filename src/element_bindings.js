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

var modelChangedTable = new SideTableInherit('modelChanged');
var modelDelegateChangedTable = new SideTableInherit('modelDelegateChanged');

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

  function makeTextObserver(textNode) {
    return {
      valueChanged: function(binding) {
        textValueChanged(textNode, binding);
      }
    };
  }

  function addTextBinding(path) {
    this.removeBinding();

    var binding = new TextReplacementsBinding(this.model, this.modelDelegate,
                                              path, makeTextObserver(this));
    textContentBindingTable.set(this, binding);
    textValueChanged(this, binding);
  }

  function removeTextBinding() {
    var binding = textContentBindingTable.get(this);
    if (binding) {
      binding.unbind();
      textContentBindingTable.delete(this);
    }
  }

  function hasOwnModel(node) {
    return modelTable.get(node) !== undefined;
  }

  function hasOwnModelDelegate(node) {
    return modelDelegateTable.get(node) !== undefined;
  }

  function hasBindings(node) {
    return attributeBindingsTable.get(node) !== undefined ||
        textContentBindingTable.get(node) !== undefined;
  }

  function modelChanged() {
    if (hasBindings(this))
      Model.enqueue(lazyModelChanged.bind(this));

    var f;
    for (var child = this.firstChild; child; child = child.nextSibling) {
      if (!hasOwnModel(child) && (f = modelChangedTable.get(child)))
        f.call(child);
    }
  }

  function modelDelegateChanged() {
    if (hasBindings(this))
      Model.enqueue(lazyModelDelegateChanged.bind(this));

    var f;
    for (var child = this.firstChild; child; child = child.nextSibling) {
      if (!hasOwnModel(child) && (f = modelDelegateChangedTable.get(child)))
        f.call(child);
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

  function handleDomNodeInsertedOrRemoved(e) {
    var node = e.target;
    if (!hasOwnModel(node))
      modelChangedTable.get(node).call(node);
  }

  function setupMutationListeners(node) {
    // If model and modelScope are set to undefined we can stop listening at
    // this level.

    // TODO(arv): Use MutationObserver instead.

    if (hasOwnModel(node) || hasOwnModelDelegate(node)) {
      // Since we are reusing the function here duplicate add will be ignored.
      node.addEventListener('DOMNodeInserted',
                            handleDomNodeInsertedOrRemoved,
                            true);
      node.addEventListener('DOMNodeRemoved',
                            handleDomNodeInsertedOrRemoved,
                            true);
    } else {
      node.removeEventListener('DOMNodeInserted',
                               handleDomNodeInsertedOrRemoved,
                               true);
      node.removeEventListener('DOMNodeRemoved',
                               handleDomNodeInsertedOrRemoved,
                               true);
    }
  }

  function setModel(model) {
    var oldModel = modelTable.get(this);

    if (oldModel === model)
      return;

    modelTable.set(this, model);
    setupMutationListeners(this);
    modelChangedTable.get(this).call(this, this);
  }

  function setModelDelegate(modelDelegate) {
    var oldModelDelegate = modelDelegateTable.get(this);

    if (oldModelDelegate === modelDelegate)
      return;

    modelDelegateTable.set(this, modelDelegate);
    setupMutationListeners(this);
    modelDelegateChangedTable.get(this).call(this, this);
  }

  function accessor(get, set) {
    return {
      get: get,
      set: set,
      enumerable: true,
      configurable: true
    };
  }

  var descriptor = {
    model: accessor(inheritedGetter(modelTable), setModel),
    modelDelegate: accessor(inheritedGetter(modelDelegateTable),
                            setModelDelegate)
  };

  [Element, Text, DocumentFragment].forEach(function(ctor) {
    Object.defineProperties(ctor.prototype, descriptor);
    modelChangedTable.set(ctor.prototype, modelChanged);
    modelDelegateChangedTable.set(ctor.prototype, modelDelegateChanged);
  });

  function lazyModelChanged() {
    // Element
    var bindings = attributeBindingsTable.get(this);
    if (bindings)
      bindings.modelChanged(this.model);

    // Text
    var binding = textContentBindingTable.get(this);
    if (binding && binding.setModel(this.model))
      textValueChanged(this, binding);
  }

  function lazyModelDelegateChanged() {
    // Element
    var bindings = attributeBindingsTable.get(this);
    if (bindings)
      bindings.modelDelegateChanged(this.modelDelegate);

    // Text
    var binding = textContentBindingTable.get(this);
    if (binding && binding.setDelegate(this.model, this.modelDelegate))
      textValueChanged(this, binding);
  }

  Element.prototype.addBinding = addBinding;
  Element.prototype.removeBinding = removeBinding;
  Text.prototype.addBinding = addTextBinding;
  Text.prototype.removeBinding = removeTextBinding;

  Object.defineProperty(Attr.prototype, 'bindingText', accessor(function() {
    var element = this.ownerElement;
    if (!element)
      return null;
    var bindings = attributeBindingsTable.get(element);
    return bindings ? bindings.bindingText(this.name) : null;
  }));

  Object.defineProperty(Text.prototype, 'bindingText', accessor(function() {
    var binding = textContentBindingTable.get(this);
    return binding ? binding.bindingText : null
  }));

  function textValueChanged(textNode, binding) {
    textNode.data = binding.value;
  }

})();
