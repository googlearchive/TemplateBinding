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

    var binding = new TextReplacementsBinding(this.model, this.modelDelegate,
                                              path, this);
    textContentBindingTable.set(this, binding);
    this.valueChanged(binding);
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

  function hasBindings(node) {
    return attributeBindingsTable.get(node) !== undefined ||
        textContentBindingTable.get(node) !== undefined;
  }

  Element.prototype.modelChanged =
  Text.prototype.modelChanged = function() {
    if (hasBindings(this))
      Model.enqueue(this.lazyModelChanged.bind(this));

    for (var child = this.firstChild; child; child = child.nextSibling) {
      if (!hasOwnModel(child))
        child.modelChanged();
    }
  };

  Element.prototype.modelDelegateChanged =
  Text.prototype.modelDelegateChanged = function() {
    if (hasBindings(this))
      Model.enqueue(this.lazyModelDelegateChanged.bind(this));

    for (var child = this.firstChild; child; child = child.nextSibling) {
      if (!hasOwnModel(child))
        child.modelDelegateChanged();
    }
  };

  Element.prototype.lazyModelChanged = function() {
    var bindings = attributeBindingsTable.get(this);
    if (bindings)
      bindings.modelChanged(this.model);
  };

  Text.prototype.lazyModelChanged = function() {
    var binding = textContentBindingTable.get(this);
    if (binding && binding.setModel(this.model))
      this.valueChanged(binding);
  };

  Element.prototype.lazyModelDelegateChanged = function() {
    var bindings = attributeBindingsTable.get(this);
    if (bindings)
      bindings.modelDelegateChanged(this.modelDelegate);
  };

  Text.prototype.lazyModelDelegateChanged = function() {
    var binding = textContentBindingTable.get(this);
    if (binding && binding.setModelDelegate(this.model, this.modelDelegate))
      this.valueChanged(binding);
  };

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

  function handleDomNodeInserted(e) {
    if (!hasOwnModel(e.target))
      e.target.modelChanged();
  }

  function handleDomNodeRemoved(e) {
    if (!hasOwnModel(e.target))
      e.target.modelChanged();
  }

  function setupMutationListeners(node) {
    // If model and modelScope are set to undefined we can stop listening at
    // this level.

    // TODO(arv): Use MutationObserver instead.

    if (hasOwnModel(node) || hasOwnModelDelegate(node)) {
      // Since we are reusing the function here duplicate add will be ignored.
      node.addEventListener('DOMNodeInserted', handleDomNodeInserted, true);
      node.addEventListener('DOMNodeRemoved', handleDomNodeRemoved, true);
    } else {
      node.removeEventListener('DOMNodeInserted', handleDomNodeInserted, true);
      node.removeEventListener('DOMNodeRemoved', handleDomNodeRemoved, true);
    }
  }

  function setModel(model) {
    var oldModel = modelTable.get(this);

    if (oldModel === model)
      return;

    modelTable.set(this, model);
    setupMutationListeners(this);
    this.modelChanged(this);
  }

  function setModelDelegate(modelDelegate) {
    var oldModelDelegate = modelDelegateTable.get(this);

    if (oldModelDelegate === modelDelegate)
      return;

    modelDelegateTable.set(this, modelDelegate);
    setupMutationListeners(this);
    this.modelDelegateChanged(this);
  }

  defineProperty(Element, 'model',
                 inheritedGetter(modelTable),
                 setModel);
  defineProperty(Element, 'modelDelegate',
                 inheritedGetter(modelDelegateTable),
                 setModelDelegate);

  defineProperty(Text, 'model',
                 inheritedGetter(modelTable),
                 setModel);
  defineProperty(Text, 'modelDelegate',
                 inheritedGetter(modelDelegateTable),
                 setModelDelegate);

  // TODO(arv): This should not be public.
  Text.prototype.valueChanged = function(binding) {
    this.data = binding.value;
  };

})();
